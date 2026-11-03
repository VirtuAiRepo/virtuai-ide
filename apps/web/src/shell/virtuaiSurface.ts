import type { LayoutToolId } from "./layout/types";

/**
 * VirtuAI Completions surface flags. Plan is offered again after Phase 2
 * (`hostTodos` + `planSessionId`) — see `docs/workitems/ide-virtuai-surface.md`.
 */
export const HIDDEN_LAYOUT_TOOLS: readonly LayoutToolId[] = [];

const HIDDEN = new Set<LayoutToolId>(HIDDEN_LAYOUT_TOOLS);

/** Workspace settle/unsettle is ThinkRail lifecycle, not the VirtuAI tenant. */
export const WORKSPACE_SETTLE_OFFERED = false;

/** JetBrains AI Central quota is not part of VirtuAI. */
export const JBCENTRAL_QUOTA_OFFERED = false;

export function isLayoutToolOffered(tool: LayoutToolId): boolean {
	return !HIDDEN.has(tool);
}

export function offeredLayoutTools(
	tools: readonly LayoutToolId[],
): LayoutToolId[] {
	return tools.filter(isLayoutToolOffered);
}
