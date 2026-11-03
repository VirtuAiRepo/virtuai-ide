import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	getLastChatSessionId,
	preferLastChatSession,
	setLastChatSessionId,
} from "./lastChatPreference";

const savedStorage = Reflect.get(globalThis, "localStorage");
const memory = new Map<string, string>();

beforeEach(() => {
	memory.clear();
	Reflect.set(globalThis, "localStorage", {
		getItem: (key: string) => memory.get(key) ?? null,
		setItem: (key: string, value: string) => {
			memory.set(key, value);
		},
		removeItem: (key: string) => {
			memory.delete(key);
		},
	});
});

afterEach(() => {
	Reflect.set(globalThis, "localStorage", savedStorage);
});

test("setLastChatSessionId round-trips through localStorage", () => {
	setLastChatSessionId("w1", "session-abc");
	expect(getLastChatSessionId("w1")).toBe("session-abc");
});

test("preferLastChatSession moves the remembered id to the front", () => {
	const summaries = [
		{ sessionId: "a", updatedAt: 3 },
		{ sessionId: "b", updatedAt: 2 },
		{ sessionId: "c", updatedAt: 1 },
	];
	expect(preferLastChatSession(summaries, "c").map((s) => s.sessionId)).toEqual(["c", "a", "b"]);
	expect(preferLastChatSession(summaries, null).map((s) => s.sessionId)).toEqual(["a", "b", "c"]);
	expect(preferLastChatSession(summaries, "missing").map((s) => s.sessionId)).toEqual([
		"a",
		"b",
		"c",
	]);
});
