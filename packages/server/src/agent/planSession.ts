import { storeRel } from "pi-todos/core";
import { virtuaiConversationFor } from "./virtuaiHistory";

/**
 * Plan (TODO list) identity for VirtuAI Completions turns.
 *
 * The Plan rail, `todo.list` / TodoStore file, and host `todo_*` tools all key
 * on the **IDE chat session id**. Completions may send a different
 * `X-Session-Id` after `virtuai.conversation.get` binds the IDE tab to a
 * VirtuAI web-chat conversation — that binding is only for server history.
 * Never use the Completions session id as the plan file key.
 *
 * @see docs/workitems/ide-virtuai-surface.md (Phase 1)
 */
export function planSessionId(ideSessionId: string): string {
	return ideSessionId;
}

/** Session id sent as Completions `X-Session-Id` (may be a VirtuAI conversation). */
export function completionsSessionId(ideSessionId: string): string {
	return virtuaiConversationFor(ideSessionId) ?? ideSessionId;
}

/** Workdir-relative path of the plan JSON for this IDE chat. */
export function planStoreRel(ideSessionId: string): string {
	return storeRel(planSessionId(ideSessionId));
}
