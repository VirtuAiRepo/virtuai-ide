/**
 * Jailed file and shell work against the IDE workdir.
 * VirtuAI never mounts this folder; the IDE applies tools here.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

export const DECLINED =
	"Command not run: the user did not authorize it (declined). They may run it " +
	"themselves; if they do, its output will be sent to you. Do not try to run it " +
	"another way — wait, or continue without it.";

export type HostAsk = (command: string) => boolean | Promise<boolean>;

export interface HostCall {
	kind: "read" | "write" | "edit" | "delete" | "search" | "glob" | "run";
	path?: string | null;
	content?: string | null;
	old?: string | null;
	new?: string | null;
	pattern?: string | null;
	command?: string | null;
}

/** Absolute path inside workdir, or null when the path escapes. */
export function jailPath(workdir: string, raw: string | null | undefined): string | null {
	const root = resolve(workdir);
	const candidate = raw && raw.trim() ? raw.trim() : ".";
	const absolute = resolve(root, candidate);
	const rel = relative(root, absolute);
	if (rel === ".." || rel.startsWith(`..${sep}`)) return null;
	if (absolute !== root && !absolute.startsWith(root + sep)) return null;
	return absolute;
}

export async function applyHostCall(
	call: HostCall,
	workdir: string,
	ask: HostAsk | null = null,
): Promise<string> {
	const root = resolve(workdir);
	if (call.kind === "run") {
		const command = call.command || "";
		const allowed = ask ? await ask(command) : false;
		if (!allowed) return DECLINED;
		const completed = spawnSync("/bin/sh", ["-c", command], {
			cwd: root,
			encoding: "utf8",
			timeout: 60_000,
		});
		const output = `${completed.stdout || ""}${completed.stderr || ""}`;
		return output || `exit ${completed.status ?? 1}`;
	}
	if (call.kind === "search") return search(root, call.pattern || "");
	if (call.kind === "glob") return glob(root, call.pattern || "");
	const absolute = jailPath(root, call.path);
	if (!absolute) return `outside the working directory (${root})`;
	if (call.kind === "read") {
		if (!existsSync(absolute) || !statSync(absolute).isFile()) return "File not found.";
		return readFileSync(absolute, "utf8");
	}
	if (call.kind === "write") {
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, call.content || "", "utf8");
		return "wrote";
	}
	if (call.kind === "edit") {
		if (!existsSync(absolute) || !statSync(absolute).isFile()) return "File not found.";
		const text = readFileSync(absolute, "utf8");
		const old = call.old || "";
		const next = call.new || "";
		if (!old || !text.includes(old)) return "The text to replace was not found.";
		writeFileSync(absolute, text.replace(old, next), "utf8");
		return "edited";
	}
	if (call.kind === "delete") {
		if (!existsSync(absolute)) return "File not found.";
		const info = statSync(absolute);
		if (info.isDirectory()) {
			rmSync(absolute, { recursive: true, force: true });
			return "deleted directory";
		}
		unlinkSync(absolute);
		return "deleted";
	}
	return `This desktop does not run ${call.kind}.`;
}

function search(root: string, pattern: string): string {
	if (!pattern) return "";
	const lines: string[] = [];
	walk(root, (file, rel) => {
		if (lines.length >= 100) return false;
		let text: string;
		try {
			text = readFileSync(file, "utf8");
		} catch {
			return true;
		}
		for (const [index, line] of text.split("\n").entries()) {
			if (line.includes(pattern)) {
				lines.push(`${rel}:${index + 1}:${line}`);
				if (lines.length >= 100) return false;
			}
		}
		return true;
	});
	return lines.join("\n");
}

function glob(root: string, pattern: string): string {
	if (!pattern || pattern.startsWith("/")) return "";
	const found: string[] = [];
	const base = resolve(root);
	// Minimal glob: ** and * via recursive walk + match.
	const regex = globToRegExp(pattern);
	walk(base, (_file, rel) => {
		if (regex.test(rel)) {
			found.push(rel);
			if (found.length >= 200) return false;
		}
		return true;
	});
	return found.join("\n");
}

function globToRegExp(pattern: string): RegExp {
	let out = "^";
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i];
		if (ch === "*" && pattern[i + 1] === "*") {
			out += ".*";
			i++;
			if (pattern[i + 1] === "/" || pattern[i + 1] === sep) i++;
		} else if (ch === "*") out += "[^/]*";
		else if (ch === "?") out += "[^/]";
		else if (".+^$()[]{}|\\".includes(ch)) out += `\\${ch}`;
		else out += ch;
	}
	out += "$";
	return new RegExp(out);
}

function walk(root: string, visit: (absolute: string, rel: string) => boolean): void {
	const stack = [root];
	while (stack.length) {
		const dir = stack.pop();
		if (!dir) continue;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.name === ".git" || entry.name === "node_modules") continue;
			const absolute = join(dir, entry.name);
			const rel = relative(root, absolute);
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) {
				stack.push(absolute);
				continue;
			}
			if (entry.isFile() && !visit(absolute, rel)) return;
		}
	}
}

export function hostCallFromTool(name: string, args: Record<string, unknown>): HostCall | null {
	const path = str(args.path) || str(args.file_path) || str(args.filePath);
	switch (name) {
		case "read":
			return { kind: "read", path };
		case "write":
			return { kind: "write", path, content: str(args.content) ?? "" };
		case "edit":
			return {
				kind: "edit",
				path,
				old: str(args.old) || str(args.oldString) || str(args.old_string) || "",
				new: str(args.new) || str(args.newString) || str(args.new_string) || "",
			};
		case "delete":
		case "rm":
		case "remove":
			return { kind: "delete", path };
		case "grep":
			return { kind: "search", pattern: str(args.pattern) || str(args.query) || "" };
		case "glob":
			return { kind: "glob", pattern: str(args.pattern) || "" };
		case "bash":
			return { kind: "run", command: str(args.command) || "" };
		default:
			return null;
	}
}

function str(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}
