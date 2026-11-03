import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyHostCall, DECLINED, jailPath } from "./hostDisk";

test("jailPath keeps in-tree paths and refuses escape", () => {
	const root = mkdtempSync(join(tmpdir(), "jail-"));
	mkdirSync(join(root, "nested"));
	expect(jailPath(root, "nested/file.txt")).toBe(join(root, "nested/file.txt"));
	expect(jailPath(root, ".")).toBe(root);
	expect(jailPath(root, "../escape")).toBeNull();
	expect(jailPath(root, join(root, "..", "elsewhere"))).toBeNull();
});

test("read/write/edit stay inside the workdir", async () => {
	const root = mkdtempSync(join(tmpdir(), "disk-"));
	expect(await applyHostCall({ kind: "write", path: "a.txt", content: "one" }, root)).toBe(
		"wrote",
	);
	expect(await applyHostCall({ kind: "read", path: "a.txt" }, root)).toBe("one");
	expect(
		await applyHostCall({ kind: "edit", path: "a.txt", old: "one", new: "two" }, root),
	).toBe("edited");
	expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("two");
	expect(await applyHostCall({ kind: "read", path: "../outside.txt" }, root)).toContain(
		"outside the working directory",
	);
});

test("bash declines without ask and runs when allowed", async () => {
	const root = mkdtempSync(join(tmpdir(), "bash-"));
	writeFileSync(join(root, "x"), "ok");
	expect(await applyHostCall({ kind: "run", command: "cat x" }, root)).toBe(DECLINED);
	expect(await applyHostCall({ kind: "run", command: "cat x" }, root, () => true)).toBe("ok");
});

test("delete removes a jailed file and refuses escape", async () => {
	const root = mkdtempSync(join(tmpdir(), "del-"));
	writeFileSync(join(root, "gone.md"), "bye");
	expect(await applyHostCall({ kind: "delete", path: "gone.md" }, root)).toBe("deleted");
	expect(existsSync(join(root, "gone.md"))).toBe(false);
	expect(await applyHostCall({ kind: "delete", path: "../outside.md" }, root)).toContain(
		"outside the working directory",
	);
});
