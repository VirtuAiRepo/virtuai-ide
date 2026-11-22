import { expect, test } from "bun:test";
import { parseVirtuaiOpenUrl, virtuaiChatUrl, workspaceSlugFromChatPath } from "./virtuaiOpen";

test("workspace slug from chat path", () => {
	expect(workspaceSlugFromChatPath("/chat/w/cris")).toBe("cris");
	expect(workspaceSlugFromChatPath("/chat/w/acme%2Fco")).toBe("acme/co");
	expect(workspaceSlugFromChatPath("/agents")).toBeNull();
});

test("virtuaiChatUrl includes session only when real", () => {
	expect(virtuaiChatUrl("https://dev.imvirtuai.com/", "cris", "a1")).toBe(
		"https://dev.imvirtuai.com/chat/w/cris?agent=a1",
	);
	expect(virtuaiChatUrl("https://dev.imvirtuai.com", "cris", "a1", "sess")).toContain("c=sess");
	expect(virtuaiChatUrl("https://dev.imvirtuai.com", "cris", "a1", "pending-x")).not.toContain(
		"c=",
	);
});

test("parseVirtuaiOpenUrl reads mode, agent, session", () => {
	const chat = "https://dev.imvirtuai.com/chat/w/cris?agent=candidate-tracker-3e6c9f73&c=sess-1";
	const href = `virtuai://open?mode=dev&url=${encodeURIComponent(chat)}`;
	const parsed = parseVirtuaiOpenUrl(href);
	expect(parsed).not.toBeNull();
	expect(parsed?.mode).toBe("dev");
	expect(parsed?.agentId).toBe("candidate-tracker-3e6c9f73");
	expect(parsed?.sessionId).toBe("sess-1");
	expect(parsed?.workspaceSlug).toBe("cris");
	expect(parsed?.origin).toBe("https://dev.imvirtuai.com");
	expect(parsed?.url).toContain("/chat/w/cris");
});

test("parseVirtuaiOpenUrl rejects non-open and non-http nested urls", () => {
	expect(parseVirtuaiOpenUrl("virtuai://pair?code=AB")).toBeNull();
	expect(parseVirtuaiOpenUrl("virtuai://open?mode=dev&url=file:///etc/passwd")).toBeNull();
	expect(parseVirtuaiOpenUrl("https://example.com")).toBeNull();
});

test("mode defaults to dev; chat is accepted", () => {
	const chat = "https://app.imvirtuai.com/chat/w/x?agent=a";
	expect(parseVirtuaiOpenUrl(`virtuai://open?url=${encodeURIComponent(chat)}`)?.mode).toBe("dev");
	expect(
		parseVirtuaiOpenUrl(`virtuai://open?mode=chat&url=${encodeURIComponent(chat)}`)?.mode,
	).toBe("chat");
});
