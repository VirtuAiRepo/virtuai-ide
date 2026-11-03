import { expect, test } from "bun:test";
import en from "../en.json";
import es from "../es.json";

const KEYS = [
	"commands.workspace.new",
	"commands.group.workspace",
	"shell.location.workspace.caption",
	"shell.location.workspace.label",
	"chat.history.scope.workspace",
	"panels.newWorkspace.titleIsolated",
] as const;

test("en labels the IDE folder as Working Directory", () => {
	for (const key of KEYS) {
		expect(en[key].toLowerCase()).toMatch(/working directory/);
		expect(en[key]).not.toMatch(/\bWorkspace\b/);
	}
});

test("es labels the IDE folder as Directorio de trabajo", () => {
	for (const key of KEYS) {
		expect(es[key].toLowerCase()).toMatch(/directorio de trabajo/);
		expect(es[key]).not.toMatch(/\bWorkspace\b/);
	}
});
