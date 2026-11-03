import { expect, test } from "bun:test";
import {
	isVirtuaiSession,
	readVirtuaiServer,
	defaultVirtuaiServerForChannel,
	isAllowedVirtuaiServer,
	writeVirtuaiServerOverride,
	readVirtuaiSavedAgentId,
	writeVirtuaiSavedAgentId,
	clearVirtuaiAccount,
	virtuaiAdminUrl,
	virtuaiAgentsUrl,
	virtuaiAuthUrl,
	virtuaiMcpUrl,
	virtuaiSkillsUrl,
	virtuaiOrigin,
	applyVirtuaiAccount,
	fetchVirtuaiAgents,
	mintVirtuaiCliToken,
	parseVirtuaiCredentials,
	preferCompletionsAgents,
	virtuaiAgentsFromPayload,
	waitForVirtuaiLogin,
} from "./virtuaiGate";

test("a server url is an origin", () => {
	expect(virtuaiOrigin("https://dev.imvirtuai.com/dashboard")).toBe("https://dev.imvirtuai.com");
	expect(virtuaiOrigin("")).toBeNull();
});

test("channel defaults map dogfood to dev and release to app", () => {
	expect(defaultVirtuaiServerForChannel("dev")).toBe("https://dev.imvirtuai.com");
	expect(defaultVirtuaiServerForChannel("canary")).toBe("https://dev.imvirtuai.com");
	expect(defaultVirtuaiServerForChannel("nightly")).toBe("https://dev.imvirtuai.com");
	expect(defaultVirtuaiServerForChannel("stable")).toBe("https://app.imvirtuai.com");
	expect(defaultVirtuaiServerForChannel("release")).toBe("https://app.imvirtuai.com");
});

test("the server comes from the environment, then a saved file, then the channel", () => {
	const files = new Map<string, string>([
		["/saved.json", JSON.stringify({ server_url: "https://app.imvirtuai.com/" })],
		["/bad.json", JSON.stringify({ server_url: "https://evil.example" })],
	]);
	expect(
		readVirtuaiServer({
			env: "https://from-env.example/app",
			files: ["/saved.json"],
			readFile: (path) => files.get(path) ?? null,
		}),
	).toBe("https://from-env.example");
	expect(
		readVirtuaiServer({
			env: undefined,
			files: ["/missing.json", "/saved.json"],
			readFile: (path) => files.get(path) ?? null,
		}),
	).toBe("https://app.imvirtuai.com");
	expect(
		readVirtuaiServer({
			env: undefined,
			files: ["/bad.json"],
			readFile: (path) => files.get(path) ?? null,
			channelDefault: defaultVirtuaiServerForChannel("dev"),
		}),
	).toBe("https://dev.imvirtuai.com");
	expect(isAllowedVirtuaiServer("https://evil.example")).toBeNull();
});

test("a Settings override only persists an allowlisted origin", () => {
	const written = new Map<string, string>();
	expect(
		writeVirtuaiServerOverride(
			"/virtuai.json",
			"https://app.imvirtuai.com",
			(path, contents) => {
				written.set(path, contents);
			},
			(path) => written.get(path) ?? null,
		),
	).toBe("https://app.imvirtuai.com");
	expect(JSON.parse(written.get("/virtuai.json") ?? "{}")).toEqual({
		server: "https://app.imvirtuai.com",
	});
	expect(
		writeVirtuaiServerOverride("/virtuai.json", "https://evil.example", () => {
			throw new Error("must not write");
		}),
	).toBeNull();
});

test("the last Completions agent is saved and restored without dropping the server", () => {
	const written = new Map<string, string>();
	const read = (path: string) => written.get(path) ?? null;
	const write = (path: string, contents: string) => {
		written.set(path, contents);
	};
	writeVirtuaiServerOverride("/virtuai.json", "https://dev.imvirtuai.com", write, read);
	expect(writeVirtuaiSavedAgentId("/virtuai.json", "logic-auditor-1", read, write)).toBe(
		"logic-auditor-1",
	);
	expect(JSON.parse(written.get("/virtuai.json") ?? "{}")).toEqual({
		server: "https://dev.imvirtuai.com",
		agent_id: "logic-auditor-1",
	});
	expect(readVirtuaiSavedAgentId("/virtuai.json", read)).toBe("logic-auditor-1");
	writeVirtuaiServerOverride("/virtuai.json", "https://app.imvirtuai.com", write, read);
	expect(readVirtuaiSavedAgentId("/virtuai.json", read)).toBe("logic-auditor-1");
});

test("auth is the server root and settings is the admin page", () => {
	expect(virtuaiAuthUrl("https://dev.imvirtuai.com")).toBe("https://dev.imvirtuai.com/");
	expect(virtuaiAdminUrl("https://dev.imvirtuai.com")).toBe("https://dev.imvirtuai.com/settings");
	expect(virtuaiSkillsUrl("https://dev.imvirtuai.com")).toBe("https://dev.imvirtuai.com/skills");
	expect(virtuaiAgentsUrl("https://dev.imvirtuai.com")).toBe("https://dev.imvirtuai.com/agents");
	expect(virtuaiMcpUrl("https://dev.imvirtuai.com")).toBe("https://dev.imvirtuai.com/mcp-servers");
});

test("the login window hides once VirtuAI has stored a session", async () => {
	let hidden = false;
	let closed = false;
	let script = "";
	let onReady: (() => void) | null = null;
	const pending = waitForVirtuaiLogin({
		server: "https://dev.imvirtuai.com",
		createWindow: (url) => {
			expect(url).toBe("https://dev.imvirtuai.com/");
			return {
				webview: {
					id: 4,
					on: (_event, listener) => {
						onReady = listener;
					},
					executeJavascript: (value) => {
						script = value;
					},
				},
				hide: () => {
					hidden = true;
				},
				close: () => {
					closed = true;
				},
			};
		},
		subscribe: (_id, listener) => {
			queueMicrotask(() => {
				onReady?.();
				listener("https://dev.imvirtuai.com/dashboard");
				listener({ url: "https://dev.imvirtuai.com/#virtuai-session" });
			});
			return () => {};
		},
	});
	const login = await pending;
	expect(hidden).toBe(true);
	expect(closed).toBe(false);
	login.close();
	expect(closed).toBe(true);
	expect(script).toContain("auth-token");
	expect(script).toContain("current-workspace");
	expect(script).not.toContain("location.replace");
	expect(isVirtuaiSession({ url: "https://dev.imvirtuai.com/#virtuai-session" })).toBe(true);
	expect(isVirtuaiSession({ type: "virtuai-session" })).toBe(true);
	expect(isVirtuaiSession("https://dev.imvirtuai.com/")).toBe(false);
});

test("a session message carries the token and the workspace", () => {
	expect(parseVirtuaiCredentials({ type: "virtuai-session" })).toBeNull();
	expect(
		parseVirtuaiCredentials({
			type: "virtuai-credentials",
			token: "jwt",
			workspaceId: 4,
			workspaceSlug: "default",
		}),
	).toEqual({ token: "jwt", workspaceId: 4, workspaceSlug: "default" });
});

test("the first listed agent becomes the chat agent", () => {
	const env: Record<string, string | undefined> = {};
	const agents = virtuaiAgentsFromPayload({
		agents: [{ agent_id: "agent-a", name: "Ada" }],
	});
	applyVirtuaiAccount(
		env,
		{ token: "jwt", workspaceId: 4, workspaceSlug: "default" },
		agents,
		"cli-secret",
		"https://dev.imvirtuai.com",
	);
	expect(env.VIRTUAI_AGENT_ID).toBe("agent-a");
	expect(env.VIRTUAI_WORKSPACE_ID).toBe("4");
	expect(env.VIRTUAI_TOKEN).toBe("jwt");
	expect(env.VIRTUAI_CLI_TOKEN).toBe("cli-secret");
	expect(env.VIRTUAI_SERVER).toBe("https://dev.imvirtuai.com");
	clearVirtuaiAccount(env);
	expect(env.VIRTUAI_TOKEN).toBeUndefined();
	expect(env.VIRTUAI_CLI_TOKEN).toBeUndefined();
});

test("a stale agent id is replaced when it leaves the Completions-eligible list", () => {
	const env: Record<string, string | undefined> = {
		VIRTUAI_AGENT_ID: "bom-specialist-gone",
	};
	applyVirtuaiAccount(
		env,
		{ token: "jwt", workspaceId: 4, workspaceSlug: "default" },
		[{ id: "agent-alive", name: "Alive" }],
		"cli-secret",
	);
	expect(env.VIRTUAI_AGENT_ID).toBe("agent-alive");
});

test("preferCompletionsAgents keeps console names when Completions lists the same ids", () => {
	expect(
		preferCompletionsAgents(
			[
				{ id: "stale", name: "Stale" },
				{ id: "alive", name: "Alive" },
			],
			["alive"],
		),
	).toEqual([{ id: "alive", name: "Alive" }]);
});

test("mintVirtuaiCliToken posts the workspace with the console JWT", async () => {
	const fetchImpl = (async (url: string, init?: RequestInit) => {
		expect(url).toBe("https://virtuai.test/api/cli/user-token");
		expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt");
		expect(new Headers(init?.headers).get("Workspace-ID")).toBe("4");
		expect(JSON.parse(String(init?.body))).toEqual({ workspace_id: 4 });
		return new Response(JSON.stringify({ token: "cli-from-server" }));
	}) as typeof fetch;
	const token = await mintVirtuaiCliToken(
		"https://virtuai.test",
		{ token: "jwt", workspaceId: 4, workspaceSlug: "default" },
		fetchImpl,
	);
	expect(token).toBe("cli-from-server");
});

test("agents come from the web chat list", async () => {
	const fetchImpl = (async (url: string) => {
		expect(String(url)).toContain("/api/web-chat/workspaces/default/agents");
		return new Response(JSON.stringify({ agents: [{ agent_id: "agent-a", name: "Ada" }] }));
	}) as typeof fetch;
	const agents = await fetchVirtuaiAgents(
		"https://virtuai.test",
		{ token: "jwt", workspaceId: 4, workspaceSlug: "default" },
		fetchImpl,
	);
	expect(agents).toEqual([{ id: "agent-a", name: "Ada" }]);
});

test("built-in Browser and Agent Builder stay out of the switcher", () => {
	expect(
		virtuaiAgentsFromPayload({
			agents: [
				{ agent_id: "agent-browser-4", name: "Browser" },
				{ agent_id: "agent-builder-4", name: "Agent Builder" },
				{ agent_id: "agent-a", name: "Ada" },
			],
		}),
	).toEqual([{ id: "agent-a", name: "Ada" }]);
});
