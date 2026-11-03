/**
 * VirtuAI web-chat conversations for the IDE history overlay.
 * Uses the console JWT + workspace id — never IDE-local history.search.
 */

import type { HistorySearchResult, PromptHit } from "@thinkrail/contracts";

export interface VirtuaiConversationRow {
	id: number;
	session_id: string;
	agent_id: string;
	title?: string | null;
	updated_at?: string | null;
	last_message_at?: string | null;
	created_at?: string | null;
	message_count?: number;
	pinned?: boolean;
}

export interface VirtuaiMessageRow {
	id: number;
	message_type: string;
	content: string;
	timestamp: string;
}

function liveEnv(): Record<string, string | undefined> {
	const proc = Reflect.get(globalThis, "process") as
		| { env?: Record<string, string | undefined> }
		| undefined;
	return proc?.env ?? {};
}

export function virtuaiHistoryAccount(
	env: Record<string, string | undefined> = liveEnv(),
): { server: string; token: string; workspaceId: string; agentId: string } | null {
	const server = env.VIRTUAI_SERVER?.trim().replace(/\/$/, "") ?? "";
	const token = env.VIRTUAI_TOKEN?.trim() ?? "";
	const workspaceId = env.VIRTUAI_WORKSPACE_ID?.trim() ?? "";
	const agentId = env.VIRTUAI_AGENT_ID?.trim() ?? "";
	if (!server || !token || !workspaceId || !agentId) return null;
	return { server, token, workspaceId, agentId };
}

function headers(account: { token: string; workspaceId: string }): HeadersInit {
	return {
		Authorization: `Bearer ${account.token}`,
		"Workspace-ID": account.workspaceId,
		Accept: "application/json",
	};
}

function stamp(row: VirtuaiConversationRow): number {
	const raw = row.last_message_at || row.updated_at || row.created_at;
	const ms = raw ? Date.parse(raw) : Number.NaN;
	return Number.isFinite(ms) ? ms : 0;
}

export function conversationToPromptHit(
	row: VirtuaiConversationRow,
	ideWorkspaceId: string,
	projectId: string | undefined,
): PromptHit {
	const title = (row.title || "").trim();
	return {
		text: title || "Conversation",
		timestamp: stamp(row),
		sessionId: row.session_id,
		sessionTitle: title || undefined,
		workspaceId: ideWorkspaceId,
		...(projectId ? { projectId } : {}),
		cwd: "virtuai",
		messageIndex: 0,
		anchorText: title || row.session_id,
	};
}

export async function searchVirtuaiConversations(
	query: string,
	ideWorkspaceId: string,
	projectId: string | undefined,
	limit = 50,
	env: Record<string, string | undefined> = liveEnv(),
	fetchImpl: typeof fetch = fetch,
): Promise<HistorySearchResult> {
	const account = virtuaiHistoryAccount(env);
	if (!account) {
		return { prompts: [], messages: [], promptTotal: 0, messageTotal: 0, indexing: false };
	}
	const params = new URLSearchParams({ limit: String(limit), offset: "0" });
	const q = query.trim();
	if (q) params.set("q", q.slice(0, 120));
	const response = await fetchImpl(
		`${account.server}/api/web-chat/conversations/${encodeURIComponent(account.agentId)}?${params}`,
		{ headers: headers(account) },
	);
	if (!response.ok) throw new Error(`VirtuAI history HTTP ${response.status}`);
	const rows = (await response.json()) as VirtuaiConversationRow[];
	const prompts = rows.map((row) => conversationToPromptHit(row, ideWorkspaceId, projectId));
	return {
		prompts,
		messages: [],
		promptTotal: prompts.length,
		messageTotal: 0,
		indexing: false,
	};
}

export async function fetchVirtuaiConversationMessages(
	sessionId: string,
	env: Record<string, string | undefined> = liveEnv(),
	fetchImpl: typeof fetch = fetch,
): Promise<VirtuaiMessageRow[]> {
	const account = virtuaiHistoryAccount(env);
	if (!account) throw new Error("VirtuAI session missing");
	const response = await fetchImpl(
		`${account.server}/api/web-chat/conversations/${encodeURIComponent(account.agentId)}/${encodeURIComponent(sessionId)}?message_limit=200&message_offset=0`,
		{ headers: headers(account) },
	);
	if (!response.ok) throw new Error(`VirtuAI conversation HTTP ${response.status}`);
	const body = (await response.json()) as { messages?: VirtuaiMessageRow[] };
	return body.messages ?? [];
}

export async function deleteVirtuaiConversation(
	sessionId: string,
	env: Record<string, string | undefined> = liveEnv(),
	fetchImpl: typeof fetch = fetch,
): Promise<void> {
	const account = virtuaiHistoryAccount(env);
	if (!account) throw new Error("VirtuAI session missing");
	const response = await fetchImpl(
		`${account.server}/api/web-chat/conversations/${encodeURIComponent(account.agentId)}/${encodeURIComponent(sessionId)}`,
		{ method: "DELETE", headers: headers(account) },
	);
	if (!response.ok && response.status !== 404) {
		throw new Error(`VirtuAI delete HTTP ${response.status}`);
	}
}

export type VirtuaiTranscriptMessage =
	| {
			role: "user";
			content: Array<{ type: "text"; text: string }>;
			timestamp: number;
	  }
	| {
			role: "assistant";
			content: Array<{ type: "text"; text: string }>;
			timestamp: number;
			stopReason: "stop";
	  };

export function messagesToTranscript(rows: VirtuaiMessageRow[]): VirtuaiTranscriptMessage[] {
	const out: VirtuaiTranscriptMessage[] = [];
	for (const row of rows) {
		const text = typeof row.content === "string" ? row.content : "";
		const timestamp = Date.parse(row.timestamp);
		const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
		if (row.message_type === "user") {
			out.push({ role: "user", content: [{ type: "text", text }], timestamp: ts });
		} else if (row.message_type === "assistant" || row.message_type === "bot") {
			out.push({
				role: "assistant",
				content: [{ type: "text", text }],
				timestamp: ts,
				stopReason: "stop",
			});
		}
	}
	return out;
}

/** IDE chat session id → VirtuAI web-chat session_id for Completions continuity. */
const conversationBindings = new Map<string, string>();

export function bindVirtuaiConversation(ideSessionId: string, virtuaiSessionId: string): void {
	conversationBindings.set(ideSessionId, virtuaiSessionId);
}

export function virtuaiConversationFor(ideSessionId: string): string | undefined {
	return conversationBindings.get(ideSessionId);
}
