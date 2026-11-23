/**
 * Desktop registers a callback so Completions turns can keep `virtuai run`
 * pointed at the active worktree without the server importing Electrobun.
 */

type RunnerSync = (workdir: string) => void;

let sync: RunnerSync | null = null;

export function onVirtuaiRunnerWorkdir(callback: RunnerSync | null): void {
	sync = callback;
}

export function notifyVirtuaiRunnerWorkdir(workdir: string | null | undefined): void {
	const path = workdir?.trim();
	if (!path || !sync) return;
	try {
		sync(path);
	} catch (error) {
		console.error("[virtuai-runner] workdir sync failed", error);
	}
}
