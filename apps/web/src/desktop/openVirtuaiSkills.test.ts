import { expect, test } from "bun:test";
import { openVirtuaiMcp, openVirtuaiSkills } from "./openVirtuaiSkills";

test("without the desktop bridge, skills stay in the local dialog", () => {
	Reflect.deleteProperty(globalThis, "__VIRTUAI_DESKTOP__");
	expect(openVirtuaiSkills()).toBe(false);
});

test("the desktop bridge opens VirtuAI's skills page", () => {
	let opened = 0;
	Reflect.set(globalThis, "__VIRTUAI_DESKTOP__", {
		openSkills: () => {
			opened += 1;
		},
	});
	expect(openVirtuaiSkills()).toBe(true);
	expect(opened).toBe(1);
	Reflect.deleteProperty(globalThis, "__VIRTUAI_DESKTOP__");
});

test("the desktop bridge opens VirtuAI's MCP servers page", () => {
	let opened = 0;
	Reflect.set(globalThis, "__VIRTUAI_DESKTOP__", {
		openMcp: () => {
			opened += 1;
		},
	});
	expect(openVirtuaiMcp()).toBe(true);
	expect(openVirtuaiSkills()).toBe(false);
	expect(opened).toBe(1);
	Reflect.deleteProperty(globalThis, "__VIRTUAI_DESKTOP__");
});
