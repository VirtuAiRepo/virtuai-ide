/**
 * Pull VirtuAI skills into `{workdir}/.virtuai/skills/<name>/`.
 * Same contract as cli/src/virtuai_cli/skills_sync.py — VirtuAI is source of truth.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

export const SKILLS_SYNC_SECONDS = 15 * 60;
export const SKILL_MARK = ".virtuai-skill";

export function skillsDir(workdir: string): string {
	return join(workdir, ".virtuai", "skills");
}

export type SkillSyncStatus = "updated" | "kept" | "removed" | `error: ${string}`;

export interface SkillCatalogEntry {
	id: string;
	name: string;
	version: string;
	path: string;
}

function versionOf(dest: string): string | null {
	try {
		return readFileSync(join(dest, SKILL_MARK), "utf8").trim();
	} catch {
		return null;
	}
}

function safeName(name: string): boolean {
	return Boolean(name) && !name.includes("/") && !name.includes("\\") && !name.startsWith(".");
}

/** Unpack a gzip skill archive into dest, refusing path escape via tar -C. */
function unpackTarGz(data: Uint8Array, dest: string): void {
	mkdirSync(dest, { recursive: true });
	const archive = join(tmpdir(), `virtuai-skill-${randomBytes(8).toString("hex")}.tgz`);
	writeFileSync(archive, data);
	try {
		const completed = spawnSync("tar", ["-xzf", archive, "-C", dest], {
			encoding: "utf8",
		});
		if (completed.status !== 0) {
			throw new Error(completed.stderr || `tar exit ${completed.status}`);
		}
	} finally {
		rmSync(archive, { force: true });
	}
}

export async function syncSkills(
	serverUrl: string,
	cliToken: string,
	workdir: string,
	fetchImpl: typeof fetch = fetch,
): Promise<Record<string, SkillSyncStatus>> {
	const base = serverUrl.replace(/\/$/, "");
	const headers = { Authorization: `Bearer ${cliToken}` };
	const listed = await fetchImpl(`${base}/api/cli/skills`, { headers });
	if (listed.status === 404) return {};
	if (!listed.ok) throw new Error(`skills list HTTP ${listed.status}`);
	const payload = (await listed.json()) as { skills?: SkillCatalogEntry[] };
	const wanted = payload.skills || [];
	const root = skillsDir(workdir);
	const result: Record<string, SkillSyncStatus> = {};
	const names = new Set<string>();

	for (const entry of wanted) {
		const name = String(entry.name || "");
		if (!safeName(name)) continue;
		names.add(name);
		const dest = join(root, name);
		const version = String(entry.version || "");
		if (existsSync(dest) && versionOf(dest) === version) {
			result[name] = "kept";
			continue;
		}
		try {
			const path = entry.path.startsWith("/") ? entry.path : `/${entry.path}`;
			const data = await fetchImpl(`${base}${path}`, { headers });
			if (!data.ok) throw new Error(`download HTTP ${data.status}`);
			const bytes = new Uint8Array(await data.arrayBuffer());
			mkdirSync(root, { recursive: true });
			const tmp = `${dest}.new`;
			rmSync(tmp, { recursive: true, force: true });
			unpackTarGz(bytes, tmp);
			writeFileSync(join(tmp, SKILL_MARK), version);
			const old = `${dest}.old`;
			rmSync(old, { recursive: true, force: true });
			if (existsSync(dest)) renameSync(dest, old);
			renameSync(tmp, dest);
			rmSync(old, { recursive: true, force: true });
			result[name] = "updated";
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			result[name] = `error: ${message.slice(0, 200)}`;
		}
	}

	if (existsSync(root)) {
		for (const name of readdirSync(root)) {
			const dest = join(root, name);
			if (!names.has(name) && existsSync(join(dest, SKILL_MARK))) {
				rmSync(dest, { recursive: true, force: true });
				result[name] = "removed";
			}
		}
	}
	return result;
}

export function startSkillsSyncLoop(input: {
	serverUrl: string;
	cliToken: () => string | null | undefined;
	workdir: () => string | null | undefined;
	everyMs?: number;
	fetchImpl?: typeof fetch;
	onStatus?: (name: string, status: SkillSyncStatus) => void;
}): () => void {
	const every = input.everyMs ?? SKILLS_SYNC_SECONDS * 1000;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const tick = async () => {
		if (stopped) return;
		const token = input.cliToken()?.trim();
		const workdir = input.workdir()?.trim();
		if (token && workdir) {
			try {
				const result = await syncSkills(
					input.serverUrl,
					token,
					workdir,
					input.fetchImpl ?? fetch,
				);
				for (const [name, status] of Object.entries(result)) {
					if (status !== "kept") input.onStatus?.(name, status);
				}
			} catch {
				// Never raise into the host loop.
			}
		}
		if (!stopped) timer = setTimeout(() => void tick(), every);
	};

	void tick();
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
