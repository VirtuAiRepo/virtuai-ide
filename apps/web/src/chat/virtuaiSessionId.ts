/** Truncate an IDE session id for the composer chrome (full id still copied). */
export function shortSessionId(sessionId: string): string {
	const id = sessionId.trim();
	if (id.length <= 12) return id;
	return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
