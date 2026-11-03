/** Remember which IDE chat was last focused per workspace (survives reload). */

const key = (workspaceId: string) => `virtuai.lastChat.${workspaceId}`;

export function getLastChatSessionId(workspaceId: string): string | null {
	try {
		const id = localStorage.getItem(key(workspaceId))?.trim() ?? "";
		return id || null;
	} catch {
		return null;
	}
}

export function setLastChatSessionId(workspaceId: string, sessionId: string): void {
	const id = sessionId.trim();
	if (!workspaceId.trim() || !id) return;
	try {
		localStorage.setItem(key(workspaceId), id);
	} catch {
		// Quota / private mode — skip; next launch falls back to updatedAt.
	}
}

/**
 * Put the remembered session first when it still exists in the workspace list.
 * Used by chat reconciliation so reopen restores "last opened", not only live/todos.
 */
export function preferLastChatSession<T extends { sessionId: string }>(
	summaries: readonly T[],
	lastSessionId: string | null,
): T[] {
	if (!lastSessionId) return [...summaries];
	const index = summaries.findIndex((summary) => summary.sessionId === lastSessionId);
	if (index <= 0) return [...summaries];
	const next = [...summaries];
	const hit = next.splice(index, 1)[0];
	if (!hit) return [...summaries];
	return [hit, ...next];
}
