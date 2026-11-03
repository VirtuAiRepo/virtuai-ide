import type { PiEvent } from "@thinkrail/contracts";
import {
	applyHostCall,
	hostCallFromTool,
	type HostAsk,
	type HostCall,
} from "./hostDisk";
import { applyTodoHostCall, isTodoHostTool } from "./hostTodos";
import { completionsSessionId } from "./planSession";

/**
 * A chat turn against the VirtuAI Completions API with host tools applied
 * under the IDE workdir. The VirtuAI server never mounts that folder.
 */

export interface VirtuaiAccount {
	server: string;
	/** Console JWT — agent list / settings webviews. */
	token: string;
	/** CLI login token — Completions and skills sync. */
	cliToken: string;
	workspaceId: string;
	agentId: string;
}

type Emit = (event: PiEvent) => void;

const HOST_TOOLS = [
	{ type: "function", function: { name: "read", parameters: { type: "object" } } },
	{ type: "function", function: { name: "write", parameters: { type: "object" } } },
	{ type: "function", function: { name: "edit", parameters: { type: "object" } } },
	{ type: "function", function: { name: "delete", parameters: { type: "object" } } },
	{ type: "function", function: { name: "grep", parameters: { type: "object" } } },
	{ type: "function", function: { name: "glob", parameters: { type: "object" } } },
	{ type: "function", function: { name: "bash", parameters: { type: "object" } } },
	{ type: "function", function: { name: "todo_list", parameters: { type: "object" } } },
	{ type: "function", function: { name: "todo_write", parameters: { type: "object" } } },
	{ type: "function", function: { name: "todo_add", parameters: { type: "object" } } },
	{ type: "function", function: { name: "todo_update", parameters: { type: "object" } } },
	{ type: "function", function: { name: "todo_remove", parameters: { type: "object" } } },
] as const;

const inflight = new Map<string, AbortController>();

function liveEnv(): Record<string, string | undefined> {
	const proc = Reflect.get(globalThis, "process") as
		| { env?: Record<string, string | undefined> }
		| undefined;
	return proc?.env ?? {};
}

export function virtuaiAccount(
	env: Record<string, string | undefined> = liveEnv(),
): VirtuaiAccount | null {
	const server = env.VIRTUAI_SERVER?.trim().replace(/\/$/, "") ?? "";
	const token = env.VIRTUAI_TOKEN?.trim() ?? "";
	const cliToken = env.VIRTUAI_CLI_TOKEN?.trim() ?? "";
	const workspaceId = env.VIRTUAI_WORKSPACE_ID?.trim() ?? "";
	const agentId = env.VIRTUAI_AGENT_ID?.trim() ?? "";
	if (!server || !token || !cliToken || !workspaceId || !agentId) return null;
	return { server, token, cliToken, workspaceId, agentId };
}

export function virtuaiReady(env?: Record<string, string | undefined>): boolean {
	return virtuaiAccount(env) !== null;
}

/** Console session is enough to own the chat rail; a turn still needs CLI + workdir. */
export function virtuaiOwnsChat(
	env: Record<string, string | undefined> = liveEnv(),
): boolean {
	const server = env.VIRTUAI_SERVER?.trim() ?? "";
	const token = env.VIRTUAI_TOKEN?.trim() ?? "";
	const workspaceId = env.VIRTUAI_WORKSPACE_ID?.trim() ?? "";
	return Boolean(server && token && workspaceId);
}

export function abortVirtuaiTurn(sessionId: string): boolean {
	const controller = inflight.get(sessionId);
	if (!controller) return false;
	controller.abort();
	return true;
}

/** Completions rejects a deleted/ineligible agent with this copy (opencode_compat). */
export function isUnknownAgentError(message: string): boolean {
	return /Unknown agent/i.test(message);
}

/** Agent ids Completions will accept for this CLI token's workspace. */
export async function listCompletionsAgentIds(
	account: Pick<VirtuaiAccount, "server" | "cliToken">,
	fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
	const response = await fetchImpl(`${account.server}/v1/models`, {
		headers: {
			Authorization: `Bearer ${account.cliToken}`,
			Accept: "application/json",
		},
	});
	if (!response.ok) return [];
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return [];
	}
	if (typeof body !== "object" || body === null) return [];
	const data = "data" in body ? body.data : null;
	if (!Array.isArray(data)) return [];
	const ids: string[] = [];
	for (const item of data) {
		if (typeof item !== "object" || item === null) continue;
		const id = "id" in item && typeof item.id === "string" ? item.id.trim() : "";
		if (id) ids.push(id);
	}
	return ids;
}

/**
 * If `account.agentId` is missing from Completions `/v1/models`, pick the first
 * listed id and write it to `env.VIRTUAI_AGENT_ID` so later turns and the
 * desktop picker stay aligned (same process.env in Electrobun).
 */
export async function healCompletionsAgent(
	account: VirtuaiAccount,
	env: Record<string, string | undefined>,
	fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
	const ids = await listCompletionsAgentIds(account, fetchImpl);
	if (ids.length === 0) return null;
	if (ids.includes(account.agentId)) return account.agentId;
	const next = ids[0] ?? null;
	if (!next) return null;
	env.VIRTUAI_AGENT_ID = next;
	return next;
}

export interface RunVirtuaiTurnOptions {
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	/** Absolute IDE workdir. Never sent to VirtuAI as a filesystem root. */
	workdir?: string | null;
	ask?: HostAsk | null;
	apply?: (call: HostCall, workdir: string, ask: HostAsk | null) => Promise<string> | string;
}

export async function runVirtuaiTurn(
	sessionId: string,
	text: string,
	emit: Emit,
	options: RunVirtuaiTurnOptions = {},
): Promise<void> {
	const env = options.env ?? liveEnv();
	const fetchImpl = options.fetchImpl ?? fetch;
	const ask = options.ask ?? null;
	const apply = options.apply ?? applyHostCall;
	const workdir = options.workdir?.trim() || null;

	const settleError = (errorMessage: string) => {
		emit({ type: "agent_start" } as PiEvent);
		emit({ type: "agent_end", messages: [], willRetry: false });
		emit({
			type: "agent_settled",
			terminal: { stopReason: "error", errorMessage },
		});
	};

	if (!workdir) {
		settleError("Open a working directory before chatting with VirtuAI.");
		return;
	}

	const initial = virtuaiAccount(env);
	if (!initial) {
		settleError(
			env.VIRTUAI_CLI_TOKEN?.trim()
				? "No VirtuAI agent is available in this workspace."
				: "VirtuAI CLI login is missing. Sign in again.",
		);
		return;
	}
	// Never send a stale/classic console id: Completions only accepts deep
	// web-chat-eligible agents (`GET /v1/models`). Heal before the first call
	// so the person never sees "Unknown agent".
	const resolvedId = await healCompletionsAgent(initial, env, fetchImpl);
	if (!resolvedId) {
		settleError("No VirtuAI agent is available in this workspace.");
		return;
	}
	let account: VirtuaiAccount = { ...initial, agentId: resolvedId };

	const controller = new AbortController();
	inflight.set(sessionId, controller);
	emit({ type: "agent_start" } as PiEvent);
	emit({
		type: "message_start",
		message: { role: "user", content: [{ type: "text", text }], timestamp: Date.now() },
	} as PiEvent);
	emit({
		type: "message_start",
		message: { role: "assistant", content: [], stopReason: "stop" },
	} as PiEvent);

	let answer = "";
	let thinking = "";
	const openTools: { id: string; name: string }[] = [];
	const paint = () => {
		const content = [
			...(thinking.trim() ? [{ type: "thinking" as const, thinking }] : []),
			...openTools.map((tool) => ({
				type: "toolCall" as const,
				id: tool.id,
				name: tool.name,
				arguments: {},
			})),
			...(answer ? [{ type: "text" as const, text: answer }] : []),
		];
		if (content.length === 0) return;
		emit({
			type: "message_update",
			assistantMessageEvent: {
				type: "text",
				partial: { role: "assistant", content, stopReason: "stop" },
			},
		} as PiEvent);
	};

	const messages: Array<Record<string, unknown>> = [
		{
			role: "system",
			content:
				"You are working in the person's local working directory through VirtuAI host tools. " +
				"Use read/write/edit/delete/grep/glob/bash against that folder. " +
				"For multi-step work, prefer todo_list / todo_write / todo_add / todo_update " +
				"(and todo_remove only for agent-authored pending steps) so the Plan rail stays in sync. " +
				"todo_write reconciles groups and preserves user-origin loose items. " +
				"To remove a file, call delete with its path — do not narrate instead of calling tools. " +
				"Keep replies short after tools succeed. Do not invent absolute paths outside the working directory.",
		},
		{ role: "user", content: text },
	];

	let healedUnknownAgent = false;
	try {
		while (!controller.signal.aborted) {
			// `sessionId` here is the IDE chat id (Plan / TodoStore key). Completions
			// may remap via bindVirtuaiConversation — see planSession.ts.
			let roundText = "";
			const live = {
				onText: (piece: string) => {
					roundText += piece;
					answer += piece;
					paint();
				},
				onReasoning: (piece: string) => {
					thinking += piece;
					paint();
				},
			};
			let calls: ToolCallSlot[];
			let finish: string;
			try {
				({ calls, finish } = await postCompletions(
					account,
					messages,
					completionsSessionId(sessionId),
					controller.signal,
					fetchImpl,
					live,
				));
			} catch (error) {
				// Safety net if the agent disappears between /v1/models and Completions.
				const message = error instanceof Error ? error.message : String(error);
				if (!healedUnknownAgent && isUnknownAgentError(message)) {
					const next = await healCompletionsAgent(account, env, fetchImpl);
					if (next && next !== account.agentId) {
						healedUnknownAgent = true;
						account = { ...account, agentId: next };
						({ calls, finish } = await postCompletions(
							account,
							messages,
							completionsSessionId(sessionId),
							controller.signal,
							fetchImpl,
							live,
						));
					} else {
						throw error;
					}
				} else {
					throw error;
				}
			}
			if (finish !== "tool_calls" || calls.length === 0) break;

			const toolResults: Array<Record<string, unknown>> = [];
			for (const call of calls) {
				const name = call.function.name || "tool";
				const id = call.id || name;
				openTools.push({ id, name });
				paint();
				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
				} catch {
					args = {};
				}
				let output: string;
				if (isTodoHostTool(name)) {
					output = applyTodoHostCall(name, args, workdir, sessionId);
					emit({
						type: "tool_execution_end",
						toolCallId: id,
						toolName: name,
						result: { content: [{ type: "text", text: output }] },
						isError: false,
					} as PiEvent);
				} else {
					const host = hostCallFromTool(name, args);
					output = host
						? await apply(host, workdir, ask)
						: `This desktop does not run ${name}.`;
					if (host) {
						emit({
							type: "tool_execution_end",
							toolCallId: id,
							toolName: name,
							result: { content: [{ type: "text", text: output }] },
							isError: false,
						} as PiEvent);
					}
				}
				const index = openTools.findIndex((tool) => tool.id === id);
				if (index >= 0) openTools.splice(index, 1);
				paint();
				toolResults.push({
					role: "tool",
					tool_call_id: id,
					content: output,
				});
			}
			messages.push({
				role: "assistant",
				content: roundText || null,
				tool_calls: calls,
			});
			messages.push(...toolResults);
		}

		const finalContent = [
			...(thinking.trim() ? [{ type: "thinking" as const, thinking }] : []),
			...(answer ? [{ type: "text" as const, text: answer }] : []),
		];
		emit({
			type: "message_end",
			message: {
				role: "assistant",
				content: finalContent.length
					? finalContent
					: [{ type: "text", text: "" }],
				stopReason: "stop",
			},
		} as PiEvent);
		emit({ type: "agent_end", messages: [], willRetry: false });
		emit({ type: "agent_settled", terminal: null });
	} catch (error) {
		const aborted = controller.signal.aborted;
		const message = aborted
			? "Stopped"
			: error instanceof Error
				? error.message
				: "VirtuAI did not answer";
		if (!aborted && (answer || thinking)) paint();
		emit({ type: "agent_end", messages: [], willRetry: false });
		emit({
			type: "agent_settled",
			terminal: aborted ? null : { stopReason: "error", errorMessage: message },
		});
	} finally {
		if (inflight.get(sessionId) === controller) inflight.delete(sessionId);
	}
}

interface ToolCallSlot {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

interface CompletionHandlers {
	onText: (text: string) => void;
	onReasoning: (text: string) => void;
	onFinish: (reason: string) => void;
	onTool: (
		index: number,
		patch: { id?: string; name?: string; arguments?: string },
	) => void;
	onError: (message: string) => void;
}

async function postCompletions(
	account: VirtuaiAccount,
	messages: Array<Record<string, unknown>>,
	sessionId: string,
	signal: AbortSignal,
	fetchImpl: typeof fetch,
	live: { onText: (text: string) => void; onReasoning: (text: string) => void },
): Promise<{ calls: ToolCallSlot[]; finish: string }> {
	const body = {
		model: account.agentId,
		messages,
		tools: HOST_TOOLS,
		stream: true,
	};
	// Completions uses the CLI token only. Never send workdir / Workspace-ID
	// as a filesystem root — the IDE applies tools locally under workdir.
	const response = await fetchImpl(`${account.server}/v1/chat/completions`, {
		method: "POST",
		signal,
		headers: {
			Authorization: `Bearer ${account.cliToken}`,
			"X-Session-Id": sessionId,
			"X-VirtuAI-Surface": "ide",
			"Content-Type": "application/json",
			Accept: "text/event-stream",
		},
		body: JSON.stringify(body),
	});
	if (!response.ok || !response.body) {
		throw new Error(await failureText(response));
	}
	return readCompletionStream(response.body, signal, live);
}

async function readCompletionStream(
	body: ReadableStream<Uint8Array>,
	signal: AbortSignal,
	live: { onText: (text: string) => void; onReasoning: (text: string) => void },
): Promise<{ calls: ToolCallSlot[]; finish: string }> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let finish = "stop";
	const slots = new Map<number, ToolCallSlot>();
	const handlers: CompletionHandlers = {
		onText: live.onText,
		onReasoning: live.onReasoning,
		onFinish: (reason) => {
			finish = reason;
		},
		onTool: (index, patch) => {
			const slot = slots.get(index) ?? {
				id: "",
				type: "function",
				function: { name: "", arguments: "" },
			};
			if (patch.id) slot.id = patch.id;
			if (patch.name) slot.function.name += patch.name;
			if (patch.arguments) slot.function.arguments += patch.arguments;
			slots.set(index, slot);
		},
		onError: (message) => {
			throw new Error(message);
		},
	};
	try {
		while (!signal.aborted) {
			const chunk = await reader.read();
			if (chunk.done) break;
			buffer += decoder.decode(chunk.value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) applyCompletionLine(line, handlers);
		}
		if (buffer.trim()) applyCompletionLine(buffer, handlers);
	} finally {
		await reader.cancel().catch(() => {});
	}
	const calls = [...slots.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([, slot]) => slot);
	return { calls, finish };
}

function applyCompletionLine(line: string, handlers: CompletionHandlers): void {
	const trimmed = line.trim();
	if (!trimmed.startsWith("data:")) return;
	const data = trimmed.slice(5).trim();
	if (!data || data === "[DONE]") return;
	let payload: unknown;
	try {
		payload = JSON.parse(data);
	} catch {
		return;
	}
	if (typeof payload !== "object" || payload === null) return;
	const event = payload as {
		error?: unknown;
		choices?: Array<{
			finish_reason?: string | null;
			delta?: {
				content?: string | null;
				reasoning_content?: string | null;
				tool_calls?: Array<{
					index?: number;
					id?: string;
					function?: { name?: string; arguments?: string };
				}>;
			};
		}>;
	};
	if (event.error) {
		const err = event.error;
		const message =
			typeof err === "object" && err !== null && "message" in err
				? String((err as { message: unknown }).message)
				: typeof err === "string"
					? err
					: "the server rejected the turn";
		handlers.onError(message);
		return;
	}
	const choice = event.choices?.[0];
	if (!choice) return;
	if (choice.finish_reason) handlers.onFinish(choice.finish_reason);
	const delta = choice.delta || {};
	if (delta.reasoning_content) handlers.onReasoning(String(delta.reasoning_content));
	if (delta.content) handlers.onText(String(delta.content));
	for (const tool of delta.tool_calls || []) {
		handlers.onTool(Number(tool.index || 0), {
			id: tool.id,
			name: tool.function?.name,
			arguments: tool.function?.arguments,
		});
	}
}

async function failureText(response: Response): Promise<string> {
	let detail = "";
	try {
		detail = (await response.text()).slice(0, 180);
	} catch {
		detail = "";
	}
	if (response.status === 401) return "VirtuAI session expired. Sign in again.";
	if (detail && !detail.startsWith("<")) return detail;
	return `VirtuAI answered HTTP ${response.status}`;
}
