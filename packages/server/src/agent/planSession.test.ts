import { expect, test } from "bun:test";
import { STORE_DIR } from "pi-todos/core";
import { bindVirtuaiConversation } from "./virtuaiHistory";
import { completionsSessionId, planSessionId, planStoreRel } from "./planSession";

test("plan session id is always the IDE chat id, even after a Completions bind", () => {
	const ide = "ide-chat-abc";
	const virtuai = "conv-server-xyz";
	expect(planSessionId(ide)).toBe(ide);
	bindVirtuaiConversation(ide, virtuai);
	expect(planSessionId(ide)).toBe(ide);
	expect(completionsSessionId(ide)).toBe(virtuai);
	expect(planStoreRel(ide)).toBe(`${STORE_DIR}/${ide}.json`);
	expect(planStoreRel(ide)).not.toContain(virtuai);
});

test("without a bind, Completions and plan share the IDE session id", () => {
	const fresh = `ide-unbound-${crypto.randomUUID().replaceAll("-", "")}`;
	expect(completionsSessionId(fresh)).toBe(fresh);
	expect(planSessionId(fresh)).toBe(fresh);
	expect(planStoreRel(fresh)).toBe(`${STORE_DIR}/${fresh}.json`);
});
