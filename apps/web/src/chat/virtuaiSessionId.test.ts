import { expect, test } from "bun:test";
import { shortSessionId } from "./virtuaiSessionId";

test("shortSessionId keeps short ids intact", () => {
	expect(shortSessionId("abc")).toBe("abc");
	expect(shortSessionId("123456789012")).toBe("123456789012");
});

test("shortSessionId truncates long ids for the chrome chip", () => {
	expect(shortSessionId("conversation-abcd-efgh-ijkl")).toBe("conver…ijkl");
});
