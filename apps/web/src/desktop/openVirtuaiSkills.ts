const DESKTOP_BRIDGE = "__VIRTUAI_DESKTOP__";

function callBridge(method: string): boolean {
	const bridge = Reflect.get(globalThis, DESKTOP_BRIDGE);
	if (typeof bridge !== "object" || bridge === null) return false;
	const open = Reflect.get(bridge, method);
	if (typeof open !== "function") return false;
	open.call(bridge);
	return true;
}

/** The desktop app opens VirtuAI's skills page. The browser keeps the local dialog. */
export function openVirtuaiSkills(): boolean {
	return callBridge("openSkills");
}

/** The desktop app opens VirtuAI's MCP servers page. The browser keeps the local inspector. */
export function openVirtuaiMcp(): boolean {
	return callBridge("openMcp");
}

/** The desktop app opens VirtuAI's agents page in the console session window. */
export function openVirtuaiAgents(): boolean {
	return callBridge("openAgents");
}
