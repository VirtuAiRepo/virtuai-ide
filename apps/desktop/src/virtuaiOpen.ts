/**
 * Parse `virtuai://open?mode=dev|chat&url=<https chat url>` from the OS
 * open-url event. Nested url carries workspace slug, agent, and optional session.
 */

export type VirtuaiShellMode = "chat" | "dev";

export interface VirtuaiOpenTarget {
	mode: VirtuaiShellMode;
	/** Absolute https/http web chat URL (workspace + agent + optional c=). */
	url: string;
	agentId: string | null;
	sessionId: string | null;
	workspaceSlug: string | null;
	origin: string | null;
}

function isHttpUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" || parsed.protocol === "http:";
	} catch {
		return false;
	}
}

/** `/chat/w/{slug}` path → workspace slug. */
export function workspaceSlugFromChatPath(pathname: string): string | null {
	const match = pathname.match(/^\/chat\/w\/([^/]+)\/?$/);
	if (!match) return null;
	try {
		return decodeURIComponent(match[1] ?? "") || null;
	} catch {
		return match[1] || null;
	}
}

export function parseVirtuaiOpenUrl(raw: string): VirtuaiOpenTarget | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (parsed.protocol !== "virtuai:") return null;
	// `virtuai://open?...` → host "open"; `virtuai:open?...` → path "/open" or "open".
	const host = parsed.hostname.toLowerCase();
	const path = parsed.pathname.replace(/^\//, "").toLowerCase();
	if (host !== "open" && path !== "open") return null;

	const modeRaw = (parsed.searchParams.get("mode") ?? "dev").trim().toLowerCase();
	const mode: VirtuaiShellMode = modeRaw === "chat" ? "chat" : "dev";
	const nested = parsed.searchParams.get("url")?.trim() ?? "";
	if (!nested || !isHttpUrl(nested)) return null;

	let chat: URL;
	try {
		chat = new URL(nested);
	} catch {
		return null;
	}
	const agentId = chat.searchParams.get("agent")?.trim() || null;
	const sessionId = chat.searchParams.get("c")?.trim() || null;
	const workspaceSlug = workspaceSlugFromChatPath(chat.pathname);
	return {
		mode,
		url: chat.toString(),
		agentId,
		sessionId: sessionId && !sessionId.startsWith("pending-") ? sessionId : null,
		workspaceSlug,
		origin: chat.origin,
	};
}

/** Build the same chat URL the web deep-link helper produces. */
export function virtuaiChatUrl(
	origin: string,
	workspaceSlug: string,
	agentId: string,
	sessionId?: string | null,
): string {
	const base = origin.replace(/\/$/, "");
	const url = new URL(`${base}/chat/w/${encodeURIComponent(workspaceSlug)}`);
	url.searchParams.set("agent", agentId);
	const session = sessionId?.trim() ?? "";
	if (session && !session.startsWith("pending-")) {
		url.searchParams.set("c", session);
	}
	return url.toString();
}
