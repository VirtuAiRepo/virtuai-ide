/**
 * VirtuAI owns the first window and the admin window.
 * VirtuAI's own shell stays the desktop after the person signs in.
 *
 * The session lives in that window's localStorage. Signalling readiness by
 * navigating to another scheme unloads the page and drops the token, so the
 * console stays up and later requests have nothing to send.
 */

const SESSION_HASH = "virtuai-session";

/** Origins the Settings control may select (alpha: no free-form tenant URL). */
export const VIRTUAI_SERVER_CHOICES = [
	"https://dev.imvirtuai.com",
	"https://app.imvirtuai.com",
	"http://127.0.0.1:8000",
	"http://localhost:8000",
	"http://127.0.0.1:8123",
	"http://localhost:8123",
] as const;

export type VirtuaiServerChoice = (typeof VIRTUAI_SERVER_CHOICES)[number];

export function virtuaiOrigin(value: string | undefined | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return url.origin;
	} catch {
		return null;
	}
}

export function isAllowedVirtuaiServer(value: string | undefined | null): string | null {
	const origin = virtuaiOrigin(value);
	if (!origin) return null;
	return (VIRTUAI_SERVER_CHOICES as readonly string[]).includes(origin) ? origin : null;
}

/** Dev/canary/nightly dogfood against dev; release builds hit prod. */
export function defaultVirtuaiServerForChannel(channel: string): string {
	const normalized = channel.trim().toLowerCase();
	if (normalized === "dev" || normalized === "canary" || normalized === "nightly") {
		return "https://dev.imvirtuai.com";
	}
	return "https://app.imvirtuai.com";
}

export function readVirtuaiServer(input: {
	env: string | undefined;
	files: readonly string[];
	readFile: (path: string) => string | null;
	channelDefault?: string | undefined;
}): string | null {
	const fromEnv = virtuaiOrigin(input.env);
	if (fromEnv) return fromEnv;
	for (const path of input.files) {
		const text = input.readFile(path);
		if (!text) continue;
		try {
			const data = JSON.parse(text) as { server?: unknown; server_url?: unknown };
			const origin = isAllowedVirtuaiServer(
				typeof data.server === "string"
					? data.server
					: typeof data.server_url === "string"
						? data.server_url
						: undefined,
			);
			if (origin) return origin;
		} catch {
			continue;
		}
	}
	const baked = input.channelDefault?.trim();
	return baked ? virtuaiOrigin(baked) : null;
}

export interface VirtuaiLocalConfig {
	server?: string;
	agent_id?: string;
}

function readVirtuaiLocalConfig(
	path: string,
	readFile: (path: string) => string | null,
): VirtuaiLocalConfig {
	const text = readFile(path);
	if (!text) return {};
	try {
		const data = JSON.parse(text) as Record<string, unknown>;
		if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
		const server =
			typeof data.server === "string"
				? data.server
				: typeof data.server_url === "string"
					? data.server_url
					: undefined;
		const agent_id = typeof data.agent_id === "string" ? data.agent_id.trim() : undefined;
		const out: VirtuaiLocalConfig = {};
		if (server) out.server = server;
		if (agent_id) out.agent_id = agent_id;
		return out;
	} catch {
		return {};
	}
}

function writeVirtuaiLocalConfig(
	path: string,
	patch: VirtuaiLocalConfig,
	readFile: (path: string) => string | null,
	writeFile: (path: string, contents: string) => void,
): VirtuaiLocalConfig {
	const current = readVirtuaiLocalConfig(path, readFile);
	const next: VirtuaiLocalConfig = { ...current, ...patch };
	if (patch.server === undefined && current.server) next.server = current.server;
	if (patch.agent_id === undefined && current.agent_id) next.agent_id = current.agent_id;
	const body: Record<string, string> = {};
	if (next.server) body.server = next.server;
	if (next.agent_id) body.agent_id = next.agent_id;
	writeFile(path, `${JSON.stringify(body, null, 2)}\n`);
	return next;
}

export function writeVirtuaiServerOverride(
	path: string,
	origin: string,
	writeFile: (path: string, contents: string) => void,
	readFile: (path: string) => string | null = () => null,
): string | null {
	const allowed = isAllowedVirtuaiServer(origin);
	if (!allowed) return null;
	writeVirtuaiLocalConfig(path, { server: allowed }, readFile, writeFile);
	return allowed;
}

/** Last Completions agent chosen in the IDE; empty / missing means none saved. */
export function readVirtuaiSavedAgentId(
	path: string,
	readFile: (path: string) => string | null,
): string | null {
	const id = readVirtuaiLocalConfig(path, readFile).agent_id?.trim() ?? "";
	return id || null;
}

export function writeVirtuaiSavedAgentId(
	path: string,
	agentId: string,
	readFile: (path: string) => string | null,
	writeFile: (path: string, contents: string) => void,
): string | null {
	const id = agentId.trim();
	if (!id || id.length > 200) return null;
	writeVirtuaiLocalConfig(path, { agent_id: id }, readFile, writeFile);
	return id;
}

export function clearVirtuaiAccount(env: Record<string, string | undefined>): void {
	delete env.VIRTUAI_TOKEN;
	delete env.VIRTUAI_CLI_TOKEN;
	delete env.VIRTUAI_AGENT_ID;
	delete env.VIRTUAI_WORKSPACE_ID;
}

export function virtuaiAuthUrl(origin: string): string {
	return `${origin}/`;
}

export function virtuaiAdminUrl(origin: string): string {
	return `${origin}/settings`;
}

export function virtuaiSkillsUrl(origin: string): string {
	return `${origin}/skills`;
}

export function virtuaiMcpUrl(origin: string): string {
	return `${origin}/mcp-servers`;
}

export function virtuaiAgentsUrl(origin: string): string {
	return `${origin}/agents`;
}

export const VIRTUAI_CREDENTIALS_TYPE = "virtuai-credentials";

export const VIRTUAI_CREDENTIALS_SCRIPT = `(() => {
	const send = window.__electrobunSendToHost;
	if (typeof send !== "function") return;
	let workspace = null;
	try { workspace = JSON.parse(localStorage.getItem("current-workspace") || "null"); } catch {}
	const token = localStorage.getItem("auth-token") || "";
	const workspaceId = workspace && typeof workspace.id === "number" ? workspace.id : null;
	const workspaceSlug = workspace && typeof workspace.slug === "string" ? workspace.slug : "";
	if (!token || workspaceId === null) return;
	send({ type: ${JSON.stringify(VIRTUAI_CREDENTIALS_TYPE)}, token, workspaceId, workspaceSlug });
})();`;

export interface VirtuaiCredentials {
	token: string;
	workspaceId: number;
	workspaceSlug: string;
}

export interface VirtuaiAgentChoice {
	id: string;
	name: string;
}

export function parseVirtuaiCredentials(detail: unknown): VirtuaiCredentials | null {
	if (typeof detail !== "object" || detail === null) return null;
	if (!("type" in detail) || detail.type !== VIRTUAI_CREDENTIALS_TYPE) return null;
	const token = "token" in detail && typeof detail.token === "string" ? detail.token.trim() : "";
	const workspaceId =
		"workspaceId" in detail && typeof detail.workspaceId === "number" ? detail.workspaceId : null;
	const workspaceSlug =
		"workspaceSlug" in detail && typeof detail.workspaceSlug === "string" ? detail.workspaceSlug : "";
	if (!token || workspaceId === null) return null;
	return { token, workspaceId, workspaceSlug };
}

export function virtuaiAgentsFromPayload(body: unknown): VirtuaiAgentChoice[] {
	if (typeof body !== "object" || body === null) return [];
	const listed = "agents" in body ? body.agents : body;
	if (!Array.isArray(listed)) return [];
	const choices: VirtuaiAgentChoice[] = [];
	for (const item of listed) {
		if (typeof item !== "object" || item === null) continue;
		const id =
			"agent_id" in item && typeof item.agent_id === "string"
				? item.agent_id
				: "id" in item && typeof item.id === "string"
					? item.id
					: "";
		if (!id || id.startsWith("agent-browser-") || id.startsWith("agent-builder-")) continue;
		const name = "name" in item && typeof item.name === "string" && item.name ? item.name : id;
		choices.push({ id, name });
	}
	return choices;
}

export function applyVirtuaiAccount(
	env: Record<string, string | undefined>,
	credentials: VirtuaiCredentials,
	agents: readonly VirtuaiAgentChoice[],
	cliToken?: string | null,
	server?: string | null,
): void {
	const origin = server?.trim();
	if (origin) env.VIRTUAI_SERVER = origin.replace(/\/$/, "");
	env.VIRTUAI_TOKEN = credentials.token;
	env.VIRTUAI_WORKSPACE_ID = String(credentials.workspaceId);
	const current = env.VIRTUAI_AGENT_ID ?? "";
	const stillListed = agents.some((agent) => agent.id === current);
	const next = stillListed ? current : (agents[0]?.id ?? "");
	if (next) env.VIRTUAI_AGENT_ID = next;
	else delete env.VIRTUAI_AGENT_ID;
	const cli = cliToken?.trim() ?? "";
	if (cli) env.VIRTUAI_CLI_TOKEN = cli;
	else delete env.VIRTUAI_CLI_TOKEN;
}

/** Mint a user-scoped CLI login token for Completions and skills sync. */
export async function mintVirtuaiCliToken(
	origin: string,
	credentials: VirtuaiCredentials,
	fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
	const response = await fetchImpl(`${origin}/api/cli/user-token`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${credentials.token}`,
			"Workspace-ID": String(credentials.workspaceId),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ workspace_id: credentials.workspaceId }),
	});
	if (!response.ok) return null;
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return null;
	}
	if (typeof body !== "object" || body === null) return null;
	const token = "token" in body && typeof body.token === "string" ? body.token.trim() : "";
	return token || null;
}

export async function fetchVirtuaiAgents(
	origin: string,
	credentials: VirtuaiCredentials,
	fetchImpl: typeof fetch = fetch,
): Promise<VirtuaiAgentChoice[]> {
	const headers = {
		Authorization: `Bearer ${credentials.token}`,
		"Workspace-ID": String(credentials.workspaceId),
	};
	if (credentials.workspaceSlug) {
		const chat = await fetchImpl(
			`${origin}/api/web-chat/workspaces/${encodeURIComponent(credentials.workspaceSlug)}/agents`,
			{ headers },
		);
		if (chat.ok) {
			const choices = virtuaiAgentsFromPayload(await chat.json());
			if (choices.length > 0) return choices;
		}
	}
	const workspace = await fetchImpl(`${origin}/api/agents/workspace`, { headers });
	if (!workspace.ok) return [];
	return virtuaiAgentsFromPayload(await workspace.json());
}

/** Ids Completions accepts (`GET /v1/models`). Empty when the call fails. */
export async function fetchCompletionsAgentIds(
	origin: string,
	cliToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
	const response = await fetchImpl(`${origin.replace(/\/$/, "")}/v1/models`, {
		headers: {
			Authorization: `Bearer ${cliToken}`,
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
 * Prefer agents Completions will accept. Falls back to the console list when
 * `/v1/models` is empty or unreachable so the picker is never blanked by a
 * transient Completions outage.
 */
export function preferCompletionsAgents(
	agents: readonly VirtuaiAgentChoice[],
	completionsIds: readonly string[],
): VirtuaiAgentChoice[] {
	if (completionsIds.length === 0) return [...agents];
	const allowed = new Set(completionsIds);
	const filtered = agents.filter((agent) => allowed.has(agent.id));
	if (filtered.length > 0) return filtered;
	return completionsIds.map((id) => ({ id, name: id }));
}

export const VIRTUAI_AUTH_WATCH = `(() => {
	if (window.__virtuaiAuthWatch) return;
	window.__virtuaiAuthWatch = true;
	const tick = () => {
		try {
			if (!localStorage.getItem("auth-token")) return;
			if (!localStorage.getItem("current-workspace")) return;
			if (location.hash !== ${JSON.stringify("#" + SESSION_HASH)}) {
				location.hash = ${JSON.stringify(SESSION_HASH)};
			}
			const send = window.__electrobunSendToHost;
			if (typeof send === "function") send({ type: ${JSON.stringify(SESSION_HASH)} });
		} catch {}
	};
	tick();
	setInterval(tick, 500);
})();`;

function detailUrl(detail: unknown): string | null {
	if (typeof detail === "string") {
		const trimmed = detail.trim();
		if (trimmed.startsWith("{")) {
			try {
				return detailUrl(JSON.parse(trimmed));
			} catch {
				return null;
			}
		}
		return trimmed;
	}
	if (
		typeof detail === "object" &&
		detail !== null &&
		"url" in detail &&
		typeof detail.url === "string"
	) {
		return detail.url;
	}
	return null;
}

export function isVirtuaiSession(detail: unknown): boolean {
	if (
		typeof detail === "object" &&
		detail !== null &&
		"type" in detail &&
		detail.type === SESSION_HASH
	) {
		return true;
	}
	const raw = detailUrl(detail);
	if (!raw) return false;
	try {
		return new URL(raw).hash === `#${SESSION_HASH}`;
	} catch {
		return false;
	}
}

export interface VirtuaiAuthWindow {
	webview: {
		id: number;
		on(event: "dom-ready", listener: () => void): void;
		executeJavascript(script: string): void;
	};
	hide(): void;
	close(): void;
}

export function waitForVirtuaiLogin(input: {
	server: string;
	createWindow: (url: string) => VirtuaiAuthWindow;
	subscribe: (webviewId: number, listener: (detail: unknown) => void) => () => void;
}): Promise<VirtuaiAuthWindow> {
	const window = input.createWindow(virtuaiAuthUrl(input.server));
	return new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			unsubscribe();
			window.hide();
			resolve(window);
		};
		const unsubscribe = input.subscribe(window.webview.id, (detail) => {
			if (isVirtuaiSession(detail)) finish();
		});
		window.webview.on("dom-ready", () => {
			window.webview.executeJavascript(VIRTUAI_AUTH_WATCH);
		});
	});
}
