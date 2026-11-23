/**
 * Supervises `virtuai run --desktop` while the IDE is open.
 * Port of virtuaiDesktop `runner.rs`: one child, restart on death, stop on quit.
 * Speaks the @@virtuai line protocol (cli desktop_bridge.py).
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Subprocess } from "bun";

export const RUNNER_PREFIX = "@@virtuai ";

export type RunnerEvent =
	| { type: "state"; state: string; message?: string }
	| { type: "status"; level: string; message: string; state?: string }
	| {
			type: "approval_request";
			id: string;
			command: string;
			reason?: string;
			workdir?: string;
			base?: string;
			scopes?: string[];
	  }
	| { type: "approval_expired"; id: string };

export type RunnerApprovalHandler = (event: Extract<RunnerEvent, { type: "approval_request" }>) => Promise<{
	approved: boolean;
	scope?: string;
}>;

export function parseRunnerLine(line: string): RunnerEvent | null {
	if (!line.startsWith(RUNNER_PREFIX)) return null;
	const raw = line.slice(RUNNER_PREFIX.length).trim();
	try {
		const data = JSON.parse(raw) as Record<string, unknown>;
		const kind = typeof data.type === "string" ? data.type : "";
		if (kind === "state" && typeof data.state === "string") {
			return {
				type: "state",
				state: data.state,
				...(typeof data.message === "string" ? { message: data.message } : {}),
			};
		}
		if (kind === "status" && typeof data.level === "string" && typeof data.message === "string") {
			return {
				type: "status",
				level: data.level,
				message: data.message,
				...(typeof data.state === "string" ? { state: data.state } : {}),
			};
		}
		if (kind === "approval_request" && typeof data.id === "string" && typeof data.command === "string") {
			return {
				type: "approval_request",
				id: data.id,
				command: data.command,
				...(typeof data.reason === "string" ? { reason: data.reason } : {}),
				...(typeof data.workdir === "string" ? { workdir: data.workdir } : {}),
				...(typeof data.base === "string" ? { base: data.base } : {}),
				...(Array.isArray(data.scopes)
					? { scopes: data.scopes.filter((s): s is string => typeof s === "string") }
					: {}),
			};
		}
		if (kind === "approval_expired" && typeof data.id === "string") {
			return { type: "approval_expired", id: data.id };
		}
		return null;
	} catch {
		return null;
	}
}

/** CLI lookup order: VIRTUAI_CLI, bundled runner, ~/.local/bin, Homebrew, PATH. */
export function cliCandidates(input: {
	bundledDir?: string | null;
	home?: string | null;
	pathEnv?: string | null;
	override?: string | null;
}): string[] {
	const exe = process.platform === "win32" ? "virtuai.exe" : "virtuai";
	const out: string[] = [];
	const override = input.override?.trim();
	if (override) out.push(override);
	if (input.bundledDir) out.push(join(input.bundledDir, exe));
	const home = input.home ?? null;
	if (home) out.push(join(home, ".local", "bin", exe));
	out.push(join("/opt/homebrew/bin", exe));
	out.push(join("/usr/local/bin", exe));
	const pathEnv = input.pathEnv ?? "";
	for (const dir of pathEnv.split(process.platform === "win32" ? ";" : ":")) {
		if (dir) out.push(join(dir, exe));
	}
	return out;
}

export function findCli(bundledDir?: string | null): string | null {
	const candidates = cliCandidates({
		bundledDir,
		home: homedir(),
		pathEnv: process.env.PATH ?? "",
		override: process.env.VIRTUAI_CLI ?? null,
	});
	return candidates.find((path) => existsSync(path)) ?? null;
}

/** Live pid from `~/.virtuai/run.lock`, if another runner already holds the machine. */
export function externalRunnerPid(lockPath = join(homedir(), ".virtuai", "run.lock")): number | null {
	if (!existsSync(lockPath)) return null;
	try {
		const raw = readFileSync(lockPath, "utf8").trim();
		const pid = Number(raw);
		if (!Number.isFinite(pid) || pid <= 0) return null;
		process.kill(pid, 0);
		return pid;
	} catch {
		return null;
	}
}

function loginPath(): string {
	const sep = process.platform === "win32" ? ";" : ":";
	const dirs = (process.env.PATH ?? "").split(sep).filter(Boolean);
	const extra = ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local", "bin")];
	for (const dir of extra) {
		if (!dirs.includes(dir)) dirs.push(dir);
	}
	return dirs.join(sep);
}

export interface VirtuaiRunnerOptions {
	onEvent?: (event: RunnerEvent) => void;
	onApproval?: RunnerApprovalHandler;
	bundledDir?: string | null;
	spawn?: typeof Bun.spawn;
}

interface RunnerTarget {
	server: string;
	workdir: string;
	cliToken?: string | null;
}

export class VirtuaiRunner {
	private child: Subprocess | null = null;
	private generation = 0;
	private target: RunnerTarget | null = null;
	private readonly onEvent: (event: RunnerEvent) => void;
	private readonly onApproval: RunnerApprovalHandler | null;
	private readonly bundledDir: string | null;
	private readonly spawnImpl: typeof Bun.spawn;

	constructor(options: VirtuaiRunnerOptions = {}) {
		this.onEvent = options.onEvent ?? (() => {});
		this.onApproval = options.onApproval ?? null;
		this.bundledDir = options.bundledDir ?? null;
		this.spawnImpl = options.spawn ?? Bun.spawn.bind(Bun);
	}

	/** Start or restart against server + workdir. Idempotent when unchanged. */
	start(server: string, workdir: string, cliToken?: string | null): void {
		const next: RunnerTarget = {
			server: server.replace(/\/$/, ""),
			workdir,
			cliToken: cliToken?.trim() || null,
		};
		if (
			this.target &&
			this.target.server === next.server &&
			this.target.workdir === next.workdir &&
			this.target.cliToken === next.cliToken &&
			this.child &&
			!this.child.killed
		) {
			return;
		}
		this.target = next;
		const generation = this.stop();
		void this.supervise(next, generation);
	}

	/** Stop the child; returns the generation a new start should use. */
	stop(): number {
		this.generation += 1;
		const child = this.child;
		this.child = null;
		if (child) {
			try {
				child.stdin?.end();
			} catch {
				/* already closed */
			}
			try {
				child.kill();
			} catch {
				/* already gone */
			}
		}
		return this.generation;
	}

	answer(id: string, approved: boolean, scope?: string): void {
		const child = this.child;
		if (!child?.stdin || child.killed) return;
		const line: Record<string, unknown> = {
			type: "approval_response",
			id,
			approved,
		};
		if (scope) line.scope = scope;
		try {
			child.stdin.write(`${JSON.stringify(line)}\n`);
		} catch (error) {
			console.error("[virtuai-runner] could not write approval response", error);
		}
	}

	private current(generation: number): boolean {
		return this.generation === generation;
	}

	private emit(event: RunnerEvent): void {
		this.onEvent(event);
	}

	private async supervise(target: RunnerTarget, generation: number): Promise<void> {
		let delayMs = 2_000;
		while (this.current(generation)) {
			const external = externalRunnerPid();
			if (external !== null) {
				// Another `virtuai run` already owns the machine lock — reuse it
				// for browser routing; do not fight it with a restart loop.
				this.emit({
					type: "state",
					state: "external_runner",
					message: `pid ${external}`,
				});
				return;
			}
			const cli = findCli(this.bundledDir);
			if (!cli) {
				this.emit({ type: "state", state: "missing_cli" });
				return;
			}
			this.emit({ type: "state", state: "starting" });
			const env: Record<string, string> = {
				...process.env,
				PATH: loginPath(),
				PYTHONUNBUFFERED: "1",
			};
			if (target.cliToken) env.VIRTUAI_CLI_TOKEN = target.cliToken;

			let child: Subprocess;
			try {
				child = this.spawnImpl([cli, "run", "--desktop", "--server", target.server, "--workdir", target.workdir], {
					stdin: "pipe",
					stdout: "pipe",
					stderr: "inherit",
					env,
				});
			} catch (error) {
				console.error("[virtuai-runner] could not start", cli, error);
				this.emit({ type: "state", state: "missing_cli" });
				return;
			}

			if (!this.current(generation)) {
				try {
					child.kill();
				} catch {
					/* ignore */
				}
				return;
			}
			this.child = child;

			let notPaired = false;
			const stdout = child.stdout;
			if (stdout && typeof stdout !== "number") {
				const reader = stdout.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				try {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split("\n");
						buffer = lines.pop() ?? "";
						for (const line of lines) {
							const event = parseRunnerLine(line.trimEnd());
							if (!event) {
								if (line.trim()) console.error(`[virtuai-runner] ${line}`);
								continue;
							}
							if (event.type === "state" && event.state === "not_paired") notPaired = true;
							if (event.type === "status" && event.state === "connected") delayMs = 2_000;
							if (event.type === "approval_request") {
								void this.handleApproval(event);
							}
							this.emit(event);
						}
					}
				} catch (error) {
					if (this.current(generation)) {
						console.error("[virtuai-runner] stdout read failed", error);
					}
				} finally {
					try {
						reader.releaseLock();
					} catch {
						/* ignore */
					}
				}
			}

			await child.exited.catch(() => 0);
			if (this.child === child) this.child = null;
			if (!this.current(generation)) return;
			if (notPaired) {
				this.emit({ type: "state", state: "not_paired" });
				return;
			}
			this.emit({ type: "state", state: "restarting" });
			await Bun.sleep(delayMs);
			delayMs = Math.min(delayMs * 2, 30_000);
		}
	}

	private async handleApproval(
		event: Extract<RunnerEvent, { type: "approval_request" }>,
	): Promise<void> {
		if (!this.onApproval) {
			this.answer(event.id, false);
			return;
		}
		try {
			const result = await this.onApproval(event);
			this.answer(event.id, result.approved, result.scope);
		} catch (error) {
			console.error("[virtuai-runner] approval handler failed", error);
			this.answer(event.id, false);
		}
	}
}
