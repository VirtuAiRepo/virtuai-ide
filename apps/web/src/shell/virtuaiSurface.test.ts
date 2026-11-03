import { describe, expect, test } from "bun:test";
import {
	HIDDEN_LAYOUT_TOOLS,
	isLayoutToolOffered,
	JBCENTRAL_QUOTA_OFFERED,
	offeredLayoutTools,
	WORKSPACE_SETTLE_OFFERED,
} from "./virtuaiSurface";

describe("virtuaiSurface", () => {
	test("plan is offered after the Completions todo bridge (Phase 2)", () => {
		expect(HIDDEN_LAYOUT_TOOLS).not.toContain("plan");
		expect(isLayoutToolOffered("plan")).toBe(true);
		expect(isLayoutToolOffered("files")).toBe(true);
		expect(offeredLayoutTools(["plan", "files", "chat"])).toEqual([
			"plan",
			"files",
			"chat",
		]);
	});

	test("settle and JetBrains quota stay off the VirtuAI product surface", () => {
		expect(WORKSPACE_SETTLE_OFFERED).toBe(false);
		expect(JBCENTRAL_QUOTA_OFFERED).toBe(false);
	});
});
