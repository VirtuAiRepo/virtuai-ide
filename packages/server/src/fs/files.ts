import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { FileNode, ResourceMeta } from "@thinkrail/contracts";
import { loadWorkspaces } from "../persistence";
import { decodeText, resourceMeta } from "./content";

function isContained(root: string, candidate: string): boolean {
	const rel = relative(root, candidate);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function posixRelative(root: string, abs: string): string {
	return relative(root, abs).split(sep).join("/");
}

export function workspaceRelativePath(root: string, path: string): string | null {
	const base = resolve(root);
	const abs = resolve(base, path);
	return isContained(base, abs) ? posixRelative(base, abs) : null;
}

function isGitMetadataPath(root: string, candidate: string): boolean {
	return relative(root, candidate).split(sep).includes(".git");
}

function assertExistingAncestorContained(root: string, abs: string): void {
	const realRoot = realpathSync(root);
	let cursor = abs;
	while (true) {
		let real: string;
		try {
			real = realpathSync(cursor);
		} catch (error) {
			const code =
				typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
			if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
			const parent = dirname(cursor);
			if (parent === cursor) throw error;
			cursor = parent;
			continue;
		}
		if (!isContained(realRoot, real)) throw new Error("Path escapes the worktree");
		if (isGitMetadataPath(realRoot, real)) throw new Error("The .git directory is not readable");
		return;
	}
}

function resolveInWorktree(
	workspaceId: string,
	path: string,
	followLeaf: boolean,
): { root: string; abs: string } {
	const ws = loadWorkspaces().find((workspace) => workspace.id === workspaceId);
	if (!ws) throw new Error(`Unknown workspace: ${workspaceId}`);

	const root = ws.worktreePath;
	const abs = resolve(root, path);
	if (!isContained(resolve(root), abs)) throw new Error("Path escapes the worktree");
	if (isGitMetadataPath(resolve(root), abs)) throw new Error("The .git directory is not readable");
	assertExistingAncestorContained(root, followLeaf ? abs : dirname(abs));
	return { root, abs };
}

export function readDir(workspaceId: string, path: string): FileNode[] {
	const { root, abs } = resolveInWorktree(workspaceId, path, true);

	return readdirSync(abs, { withFileTypes: true })
		.filter((entry) => entry.name !== ".git")
		.map(
			(entry): FileNode => ({
				path: posixRelative(root, join(abs, entry.name)),
				name: entry.name,
				kind: entry.isDirectory() ? "dir" : "file",
			}),
		)
		.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1));
}

export function readFile(
	workspaceId: string,
	path: string,
): { content: string; meta: ResourceMeta } {
	const { abs } = resolveInWorktree(workspaceId, path, true);
	const bytes = readFileSync(abs);
	const meta = resourceMeta(bytes, path);
	return { content: meta.text ? decodeText(bytes) : "", meta };
}

export function writeFile(
	workspaceId: string,
	path: string,
	content: string,
): { content: string; meta: ResourceMeta } {
	const relativePath = normalizeWritablePath(path);
	const { abs } = resolveInWorktree(workspaceId, relativePath, false);
	if (existsSync(abs)) {
		const stat = statSync(abs);
		if (stat.isDirectory()) throw new Error("Path is a directory");
	}
	const dir = dirname(abs);
	mkdirSync(dir, { recursive: true });
	const tmp = join(dir, `.thinkrail-write-${process.pid}-${randomUUID().slice(0, 8)}.tmp`);
	try {
		writeFileSync(tmp, content, "utf8");
		renameSync(tmp, abs);
	} catch (error) {
		rmSync(tmp, { force: true });
		throw error;
	}
	const bytes = Buffer.from(content, "utf8");
	const meta = resourceMeta(bytes, relativePath);
	return { content: meta.text ? content : "", meta };
}

export function mkdir(workspaceId: string, path: string): { path: string } {
	const relativePath = normalizeWritablePath(path);
	const { root, abs } = resolveInWorktree(workspaceId, relativePath, false);
	if (existsSync(abs)) {
		const stat = statSync(abs);
		if (!stat.isDirectory()) throw new Error("Path is a file");
		return { path: posixRelative(root, abs) };
	}
	mkdirSync(abs, { recursive: true });
	return { path: posixRelative(root, abs) };
}

function normalizeWritablePath(path: string): string {
	const trimmed = path.trim().replace(/\\/g, "/");
	if (!trimmed || trimmed === "." || trimmed === "/") throw new Error("Path is required");
	if (trimmed.split("/").some((part) => part === ".." || part === "")) {
		throw new Error("Path escapes the worktree");
	}
	return trimmed.replace(/^\.\//, "");
}

export function resolveWorktreeFile(
	workspaceId: string,
	path: string,
	options: { followLeaf?: boolean } = {},
): string {
	return resolveInWorktree(workspaceId, path, options.followLeaf !== false).abs;
}
