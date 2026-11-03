import { expect, test } from "bun:test";
import {
	conversationToPromptHit,
	messagesToTranscript,
	searchVirtuaiConversations,
	virtuaiHistoryAccount,
} from "./virtuaiHistory";

const env = {
	VIRTUAI_SERVER: "https://virtuai.test",
	VIRTUAI_TOKEN: "jwt",
	VIRTUAI_WORKSPACE_ID: "4",
	VIRTUAI_AGENT_ID: "agent-1",
};

test("history account needs console JWT and agent", () => {
	expect(virtuaiHistoryAccount(env)?.agentId).toBe("agent-1");
	expect(virtuaiHistoryAccount({ ...env, VIRTUAI_TOKEN: "" })).toBeNull();
});

test("searchVirtuaiConversations lists the agent conversations from the server", async () => {
	const fetchImpl = (async (url: string, init?: RequestInit) => {
		expect(url).toContain("/api/web-chat/conversations/agent-1?");
		expect(url).toContain("q=auth");
		expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt");
		expect(new Headers(init?.headers).get("Workspace-ID")).toBe("4");
		return new Response(
			JSON.stringify([
				{
					id: 9,
					session_id: "conv-1",
					agent_id: "agent-1",
					title: "Auth refresh",
					last_message_at: "2026-11-02T12:00:00.000Z",
				},
			]),
		);
	}) as typeof fetch;
	const result = await searchVirtuaiConversations(
		"auth",
		"ws-ide",
		"proj-1",
		50,
		env,
		fetchImpl,
	);
	expect(result.prompts).toHaveLength(1);
	expect(result.prompts[0]).toMatchObject({
		sessionId: "conv-1",
		sessionTitle: "Auth refresh",
		cwd: "virtuai",
		workspaceId: "ws-ide",
		projectId: "proj-1",
	});
	expect(result.messages).toEqual([]);
});

test("messagesToTranscript keeps user and assistant turns", () => {
	expect(
		messagesToTranscript([
			{
				id: 1,
				message_type: "user",
				content: "hi",
				timestamp: "2026-11-02T12:00:00.000Z",
			},
			{
				id: 2,
				message_type: "assistant",
				content: "hello",
				timestamp: "2026-11-02T12:00:01.000Z",
			},
		]),
	).toEqual([
		{
			role: "user",
			content: [{ type: "text", text: "hi" }],
			timestamp: Date.parse("2026-11-02T12:00:00.000Z"),
		},
		{
			role: "assistant",
			content: [{ type: "text", text: "hello" }],
			timestamp: Date.parse("2026-11-02T12:00:01.000Z"),
			stopReason: "stop",
		},
	]);
});

test("conversationToPromptHit falls back when the title is empty", () => {
	expect(
		conversationToPromptHit(
			{ id: 1, session_id: "s", agent_id: "a", title: null },
			"w",
			undefined,
		).text,
	).toBe("Conversation");
});
