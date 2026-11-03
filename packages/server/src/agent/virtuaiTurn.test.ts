import { expect, test } from "bun:test";
import type { PiEvent } from "@thinkrail/contracts";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jailPath } from "./hostDisk";
import { listPlanItemsForTest } from "./hostTodos";
import { planSessionId, planStoreRel } from "./planSession";
import { bindVirtuaiConversation } from "./virtuaiHistory";
import { runVirtuaiTurn, virtuaiAccount } from "./virtuaiTurn";
import { TodoStore } from "pi-todos/core";

const env = {
	VIRTUAI_SERVER: "https://virtuai.test",
	VIRTUAI_TOKEN: "console-jwt",
	VIRTUAI_CLI_TOKEN: "cli-token",
	VIRTUAI_WORKSPACE_ID: "4",
	VIRTUAI_AGENT_ID: "agent-1",
};

function stream(chunks: string[]): Response {
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
				controller.close();
			},
		}),
		{ status: 200, headers: { "content-type": "text/event-stream" } },
	);
}

function completionChunks(text: string, finish = "stop"): string[] {
	return [
		`data: ${JSON.stringify({
			choices: [{ delta: { content: text }, finish_reason: finish }],
		})}\n`,
		"data: [DONE]\n",
	];
}

/** Every turn probes Completions eligibility first; answer with the env agent id. */
function withModels(
	inner: typeof fetch,
	agentId = env.VIRTUAI_AGENT_ID,
): typeof fetch {
	return (async (url: string, init?: RequestInit) => {
		if (String(url).endsWith("/v1/models")) {
			return new Response(
				JSON.stringify({
					object: "list",
					data: [{ id: agentId, object: "model", name: agentId }],
				}),
			);
		}
		return inner(url, init);
	}) as typeof fetch;
}

test("an account needs the server, console token, CLI token, workspace and an agent", () => {
	expect(virtuaiAccount(env)?.agentId).toBe("agent-1");
	expect(virtuaiAccount({ ...env, VIRTUAI_TOKEN: "" })).toBeNull();
	expect(virtuaiAccount({ ...env, VIRTUAI_CLI_TOKEN: "" })).toBeNull();
});

test("missing workdir settles without calling Completions", async () => {
	const events: PiEvent[] = [];
	let called = false;
	const fetchImpl = (() => {
		called = true;
		return Promise.resolve(new Response(""));
	}) as typeof fetch;
	await runVirtuaiTurn("local-noworkdir", "hello", (event) => events.push(event), {
		env,
		fetchImpl,
		workdir: null,
	});
	expect(called).toBe(false);
	const settled = events.at(-1);
	expect(settled?.type).toBe("agent_settled");
	if (settled?.type === "agent_settled")
		expect(settled.terminal?.errorMessage).toContain("working directory");
});

test("a Completions reply is painted and never sends workdir on the wire", async () => {
	const events: PiEvent[] = [];
	const bodies: string[] = [];
	const headersSeen: string[] = [];
	const workdir = mkdtempSync(join(tmpdir(), "virtuai-workdir-"));
	const fetchImpl = withModels(async (url: string, init?: RequestInit) => {
		expect(url).toBe("https://virtuai.test/v1/chat/completions");
		const headers = new Headers(init?.headers);
		expect(headers.get("Authorization")).toBe("Bearer cli-token");
		expect(headers.get("X-VirtuAI-Surface")).toBe("ide");
		expect(headers.get("Workspace-ID")).toBeNull();
		headersSeen.push(headers.get("Authorization") || "");
		const body = String(init?.body ?? "");
		bodies.push(body);
		expect(body).not.toContain("workdir");
		expect(body).not.toContain(workdir);
		expect(JSON.parse(body).model).toBe("agent-1");
		return stream(completionChunks("Hi"));
	});
	await runVirtuaiTurn("local-1", "hello", (event) => events.push(event), {
		env,
		fetchImpl,
		workdir,
	});
	const updates = events.filter((event) => event.type === "message_update");
	expect(updates.length).toBeGreaterThanOrEqual(1);
	expect(events.at(-1)).toEqual({ type: "agent_settled", terminal: null });
	expect(headersSeen[0]).toBe("Bearer cli-token");
});

test("reasoning_content streams as a Thinking block while the turn runs", async () => {
	const events: PiEvent[] = [];
	const workdir = mkdtempSync(join(tmpdir(), "virtuai-think-"));
	const fetchImpl = withModels(async () =>
		stream([
			`data: ${JSON.stringify({
				choices: [{ delta: { reasoning_content: "Delete with the tool." } }],
			})}\n`,
			`data: ${JSON.stringify({
				choices: [{ delta: { content: "Deleted." }, finish_reason: "stop" }],
			})}\n`,
			"data: [DONE]\n",
		]),
	);
	await runVirtuaiTurn("local-think", "delete them", (event) => events.push(event), {
		env,
		fetchImpl,
		workdir,
	});
	const updates = events.filter((event) => event.type === "message_update");
	expect(updates.length).toBeGreaterThanOrEqual(2);
	const first = updates[0];
	expect(first?.type).toBe("message_update");
	if (first?.type === "message_update") {
		const partial = (
			first.assistantMessageEvent as {
				partial?: { content?: Array<{ type: string; thinking?: string; text?: string }> };
			}
		).partial;
		expect(partial?.content?.[0]).toEqual({
			type: "thinking",
			thinking: "Delete with the tool.",
		});
	}
	const last = updates.at(-1);
	if (last?.type === "message_update") {
		const partial = (
			last.assistantMessageEvent as {
				partial?: { content?: Array<{ type: string; thinking?: string; text?: string }> };
			}
		).partial;
		expect(partial?.content).toEqual([
			{ type: "thinking", thinking: "Delete with the tool." },
			{ type: "text", text: "Deleted." },
		]);
	}
});

test("tool calls apply under the workdir and continue the Completions loop", async () => {
	const workdir = mkdtempSync(join(tmpdir(), "virtuai-tools-"));
	writeFileSync(join(workdir, "note.txt"), "hello-file");
	const events: PiEvent[] = [];
	let round = 0;
	const fetchImpl = withModels(async (_url: string, init?: RequestInit) => {
		round += 1;
		const body = JSON.parse(String(init?.body ?? "{}")) as {
			messages: Array<{ role: string; content?: string | null; tool_call_id?: string }>;
		};
		if (round === 1) {
			return stream([
				`data: ${JSON.stringify({
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call-1",
										function: {
											name: "read",
											arguments: JSON.stringify({ path: "note.txt" }),
										},
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
				})}\n`,
				"data: [DONE]\n",
			]);
		}
		const tool = body.messages.find((message) => message.role === "tool");
		expect(tool?.content).toBe("hello-file");
		expect(JSON.stringify(body)).not.toMatch(/"workdir"|"root"/);
		return stream(completionChunks("done"));
	});
	await runVirtuaiTurn("local-tools", "read it", (event) => events.push(event), {
		env,
		fetchImpl,
		workdir,
	});
	expect(events.at(-1)).toEqual({ type: "agent_settled", terminal: null });
	expect(round).toBe(2);
});

test("path jail refuses paths outside the workdir", () => {
	const workdir = mkdtempSync(join(tmpdir(), "virtuai-jail-"));
	mkdirSync(join(workdir, "src"));
	expect(jailPath(workdir, "src/a.ts")).toBe(join(workdir, "src/a.ts"));
	expect(jailPath(workdir, "../outside")).toBeNull();
	expect(jailPath(workdir, "/etc/passwd")).toBeNull();
});

test("a stale agent id is replaced from /v1/models before Completions is called", async () => {
	const events: PiEvent[] = [];
	const workdir = mkdtempSync(join(tmpdir(), "virtuai-heal-"));
	const turnEnv = { ...env, VIRTUAI_AGENT_ID: "bom-specialist-gone" };
	let completions = 0;
	let modelsCalls = 0;
	const fetchImpl = (async (url: string, init?: RequestInit) => {
		if (String(url).endsWith("/v1/models")) {
			modelsCalls += 1;
			return new Response(
				JSON.stringify({
					object: "list",
					data: [{ id: "agent-alive", object: "model", name: "Alive" }],
				}),
			);
		}
		completions += 1;
		const body = JSON.parse(String(init?.body ?? "{}"));
		expect(body.model).toBe("agent-alive");
		expect(body.model).not.toBe("bom-specialist-gone");
		return stream(completionChunks("OK"));
	}) as typeof fetch;
	await runVirtuaiTurn("local-heal", "hello", (event) => events.push(event), {
		env: turnEnv,
		fetchImpl,
		workdir,
	});
	expect(modelsCalls).toBeGreaterThanOrEqual(1);
	expect(completions).toBe(1);
	expect(turnEnv.VIRTUAI_AGENT_ID).toBe("agent-alive");
	expect(events.at(-1)).toEqual({ type: "agent_settled", terminal: null });
});

test("Unknown agent mid-flight still heals once and retries Completions", async () => {
	const events: PiEvent[] = [];
	const workdir = mkdtempSync(join(tmpdir(), "virtuai-heal-race-"));
	const turnEnv = { ...env, VIRTUAI_AGENT_ID: "agent-alive" };
	let completions = 0;
	let modelsCalls = 0;
	const fetchImpl = (async (url: string, init?: RequestInit) => {
		if (String(url).endsWith("/v1/models")) {
			modelsCalls += 1;
			const id = modelsCalls === 1 ? "agent-alive" : "agent-next";
			return new Response(
				JSON.stringify({ object: "list", data: [{ id, object: "model", name: id }] }),
			);
		}
		completions += 1;
		const body = JSON.parse(String(init?.body ?? "{}"));
		if (completions === 1) {
			expect(body.model).toBe("agent-alive");
			return new Response(
				JSON.stringify({
					detail: "Unknown agent 'agent-alive'. Call GET /v1/models for workspace agents.",
				}),
				{ status: 404 },
			);
		}
		expect(body.model).toBe("agent-next");
		return stream(completionChunks("OK"));
	}) as typeof fetch;
	await runVirtuaiTurn("local-heal-race", "hello", (event) => events.push(event), {
		env: turnEnv,
		fetchImpl,
		workdir,
	});
	expect(completions).toBe(2);
	expect(turnEnv.VIRTUAI_AGENT_ID).toBe("agent-next");
	expect(events.at(-1)).toEqual({ type: "agent_settled", terminal: null });
});

test("a server error settles the turn instead of asking for a provider key", async () => {
	const events: PiEvent[] = [];
	const workdir = mkdtempSync(join(tmpdir(), "virtuai-err-"));
	const fetchImpl = withModels(
		async () => new Response(JSON.stringify({ detail: "nope" }), { status: 500 }),
	);
	await runVirtuaiTurn("local-2", "hello", (event) => events.push(event), {
		env,
		fetchImpl,
		workdir,
	});
	const settled = events.at(-1);
	expect(settled?.type).toBe("agent_settled");
	if (settled?.type === "agent_settled") expect(settled.terminal?.errorMessage).toContain("nope");
});

test("a signed-in workspace with no agent does not ask Pi for a key", async () => {
	const events: PiEvent[] = [];
	let called = false;
	const fetchImpl = (() => {
		called = true;
		return Promise.resolve(new Response(""));
	}) as typeof fetch;
	await runVirtuaiTurn("local-3", "hello", (event) => events.push(event), {
		env: { ...env, VIRTUAI_AGENT_ID: "" },
		fetchImpl,
		workdir: mkdtempSync(join(tmpdir(), "virtuai-noagent-")),
	});
	expect(called).toBe(false);
	const settled = events.at(-1);
	expect(settled?.type).toBe("agent_settled");
	if (settled?.type === "agent_settled")
		expect(settled.terminal?.errorMessage).toMatch(/No VirtuAI agent|CLI login/);
});

test("after a history bind, Completions uses the VirtuAI id but the plan key stays the IDE id", async () => {
	const ideSession = "ide-plan-phase1";
	const virtuaiSession = "conv-from-server";
	bindVirtuaiConversation(ideSession, virtuaiSession);
	expect(planSessionId(ideSession)).toBe(ideSession);
	expect(planStoreRel(ideSession)).toContain(ideSession);
	expect(planStoreRel(ideSession)).not.toContain(virtuaiSession);

	let sessionHeader: string | null = null;
	const fetchImpl = withModels(async (_url: string, init?: RequestInit) => {
		sessionHeader = new Headers(init?.headers).get("X-Session-Id");
		return stream(completionChunks("ok"));
	});
	await runVirtuaiTurn(ideSession, "hello", () => {}, {
		env,
		fetchImpl,
		workdir: mkdtempSync(join(tmpdir(), "virtuai-bind-")),
	});
	expect(sessionHeader).toBe(virtuaiSession);
});

test("todo_write from Completions writes the IDE plan file and keeps user items", async () => {
	const ideSession = "ide-todo-turn";
	const workdir = mkdtempSync(join(tmpdir(), "virtuai-todos-"));
	new TodoStore(workdir, ideSession).add({ title: "User seed", origin: "user" });

	let round = 0;
	const fetchImpl = withModels(async () => {
		round += 1;
		if (round === 1) {
			return stream([
				`data: ${JSON.stringify({
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: "call-todo",
										function: {
											name: "todo_write",
											arguments: JSON.stringify({
												groups: [
													{
														title: "Demo",
														todos: [{ title: "From agent" }],
													},
												],
											}),
										},
									},
								],
							},
							finish_reason: "tool_calls",
						},
					],
				})}\n`,
				"data: [DONE]\n",
			]);
		}
		return stream(completionChunks("Plan updated."));
	});

	const events: PiEvent[] = [];
	await runVirtuaiTurn(ideSession, "plan it", (event) => events.push(event), {
		env,
		fetchImpl,
		workdir,
	});
	expect(events.some((event) => event.type === "tool_execution_end")).toBe(true);
	const items = listPlanItemsForTest(workdir, ideSession);
	expect(items.some((todo) => todo.title === "User seed" && todo.origin === "user")).toBe(true);
	expect(items.some((todo) => todo.title === "From agent")).toBe(true);
	expect(events.at(-1)).toEqual({ type: "agent_settled", terminal: null });
});
