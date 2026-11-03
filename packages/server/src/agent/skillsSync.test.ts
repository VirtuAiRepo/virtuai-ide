import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { SKILL_MARK, skillsDir, syncSkills } from "./skillsSync";

function makeSkillArchive(dir: string, body: string): Uint8Array {
	writeFileSync(join(dir, "SKILL.md"), body);
	const archive = join(dir, "skill.tgz");
	const packed = spawnSync("tar", ["-czf", archive, "SKILL.md"], {
		cwd: dir,
		encoding: "utf8",
	});
	expect(packed.status).toBe(0);
	return new Uint8Array(readFileSync(archive));
}

test("syncSkills downloads new versions, keeps matching, and removes unmarked orphans with the mark", async () => {
	const workdir = mkdtempSync(join(tmpdir(), "skills-sync-"));
	const scratch = mkdtempSync(join(tmpdir(), "skills-pack-"));
	const archive = makeSkillArchive(scratch, "# hello");

	const root = skillsDir(workdir);
	mkdirSync(join(root, "gone"), { recursive: true });
	writeFileSync(join(root, "gone", SKILL_MARK), "old");
	mkdirSync(join(root, "local-only"), { recursive: true });
	writeFileSync(join(root, "local-only", "note.txt"), "mine");

	const fetchImpl = (async (url: string) => {
		if (url.endsWith("/api/cli/skills")) {
			return new Response(
				JSON.stringify({
					skills: [
						{ id: "1", name: "demo", version: "v2", path: "/api/cli/skills/1" },
					],
				}),
			);
		}
		if (url.endsWith("/api/cli/skills/1")) {
			return new Response(archive);
		}
		return new Response("missing", { status: 404 });
	}) as typeof fetch;

	const first = await syncSkills("https://virtuai.test", "cli-token", workdir, fetchImpl);
	expect(first.demo).toBe("updated");
	expect(first.gone).toBe("removed");
	expect(existsSync(join(root, "local-only", "note.txt"))).toBe(true);
	expect(readFileSync(join(root, "demo", SKILL_MARK), "utf8")).toBe("v2");
	expect(readFileSync(join(root, "demo", "SKILL.md"), "utf8")).toBe("# hello");

	const second = await syncSkills("https://virtuai.test", "cli-token", workdir, fetchImpl);
	expect(second.demo).toBe("kept");
});

test("syncSkills does not put skills under workdir/skills", async () => {
	const workdir = mkdtempSync(join(tmpdir(), "skills-path-"));
	const fetchImpl = (async () =>
		new Response(JSON.stringify({ skills: [] }))) as typeof fetch;
	await syncSkills("https://virtuai.test", "cli-token", workdir, fetchImpl);
	expect(skillsDir(workdir)).toBe(join(workdir, ".virtuai", "skills"));
	expect(existsSync(join(workdir, "skills"))).toBe(false);
});
