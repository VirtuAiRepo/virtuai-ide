const DESKTOP_BRIDGE = "__VIRTUAI_DESKTOP__";

export type VirtuaiShellMode = "chat" | "dev";

function callBridge(method: string): boolean {
	const bridge = Reflect.get(globalThis, DESKTOP_BRIDGE);
	if (typeof bridge !== "object" || bridge === null) return false;
	const open = Reflect.get(bridge, method);
	if (typeof open !== "function") return false;
	open.call(bridge);
	return true;
}

/** True when the Electrobun host exposes Chat ↔ Dev switching. */
export function canSwitchVirtuaiShell(): boolean {
	const bridge = Reflect.get(globalThis, DESKTOP_BRIDGE);
	if (typeof bridge !== "object" || bridge === null) return false;
	return (
		typeof Reflect.get(bridge, "switchToChat") === "function" &&
		typeof Reflect.get(bridge, "switchToDev") === "function"
	);
}

/** Leave ThinkRail Dev and show the workspace web chat. */
export function switchVirtuaiShellToChat(): boolean {
	return callBridge("switchToChat");
}

/** Focus ThinkRail Dev (no-op when already there). */
export function switchVirtuaiShellToDev(): boolean {
	return callBridge("switchToDev");
}
