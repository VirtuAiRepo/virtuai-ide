/**
 * Plan tools for VirtuAI Completions — same TodoStore / workdir jail as the
 * Plan rail. Keyed by IDE chat session id (`planSessionId`), never the
 * Completions-bound VirtuAI conversation id.
 */

import {
	countItems,
	flatItems,
	TODO_STATUSES,
	type TodoPlan,
	type TodoStatus,
	TodoStore,
	type WritePlan,
} from "pi-todos/core";
import { planSessionId } from "./planSession";

export type TodoHostName =
	| "todo_list"
	| "todo_write"
	| "todo_add"
	| "todo_update"
	| "todo_remove";

const TODO_NAMES = new Set<string>([
	"todo_list",
	"todo_write",
	"todo_add",
	"todo_update",
	"todo_remove",
]);

export function isTodoHostTool(name: string): name is TodoHostName {
	return TODO_NAMES.has(name);
}

const GLYPH: Record<TodoStatus, string> = {
	pending: "[ ]",
	in_progress: "[~]",
	done: "[x]",
};

function formatPlan(plan: TodoPlan): string {
	const lines: string[] = [];
	for (const group of plan.groups) {
		const done = group.todos.filter((todo) => todo.status === "done").length;
		lines.push(`▸ ${group.title} [${done}/${group.todos.length}]`);
		for (const todo of group.todos) {
			lines.push(`  ${GLYPH[todo.status]} ${todo.title} — ${todo.id}`);
		}
	}
	if (plan.todos.length > 0) {
		if (plan.groups.length > 0) lines.push("Loose queue:");
		for (const todo of plan.todos) {
			lines.push(`${GLYPH[todo.status]} ${todo.title} — ${todo.id}`);
		}
	}
	return lines.join("\n") || "(empty plan)";
}

function store(workdir: string, ideSessionId: string): TodoStore {
	return new TodoStore(workdir, planSessionId(ideSessionId));
}

function str(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asStatus(value: unknown): TodoStatus | undefined {
	return typeof value === "string" && (TODO_STATUSES as readonly string[]).includes(value)
		? (value as TodoStatus)
		: undefined;
}

function parseWritePlan(args: Record<string, unknown>): WritePlan | string {
	const groupsRaw = args.groups;
	if (!Array.isArray(groupsRaw)) return "todo_write requires a groups array.";
	const groups: WritePlan["groups"] = [];
	for (const group of groupsRaw) {
		if (!group || typeof group !== "object") return "Each group must be an object.";
		const g = group as Record<string, unknown>;
		const title = str(g.title)?.trim();
		if (!title) return "Each group needs a title.";
		const todosRaw = g.todos;
		if (!Array.isArray(todosRaw)) return `Group "${title}" needs a todos array.`;
		const todos = [];
		for (const item of todosRaw) {
			if (!item || typeof item !== "object") return `Group "${title}" has a bad step.`;
			const step = item as Record<string, unknown>;
			const stepTitle = str(step.title)?.trim();
			if (!stepTitle) return `Group "${title}" has a step without a title.`;
			const status = asStatus(step.status);
			todos.push({
				title: stepTitle,
				...(status ? { status } : {}),
				...(str(step.note) ? { note: str(step.note)! } : {}),
			});
		}
		groups.push({ title, todos });
	}
	return { groups };
}

/** Apply a Completions todo_* tool against the workdir plan file. */
export function applyTodoHostCall(
	name: TodoHostName,
	args: Record<string, unknown>,
	workdir: string,
	ideSessionId: string,
): string {
	const todos = store(workdir, ideSessionId);
	try {
		if (name === "todo_list") {
			const plan = todos.read();
			const status = asStatus(args.status);
			const filtered: TodoPlan = status
				? {
						todos: plan.todos.filter((todo) => todo.status === status),
						groups: plan.groups
							.map((group) => ({
								...group,
								todos: group.todos.filter((todo) => todo.status === status),
							}))
							.filter((group) => group.todos.length > 0),
					}
				: plan;
			const count = countItems(filtered);
			return count
				? `Plan (${count} item(s)):\n${formatPlan(filtered)}`
				: status
					? `No items with status ${status}.`
					: "Plan is empty.";
		}
		if (name === "todo_write") {
			const parsed = parseWritePlan(args);
			if (typeof parsed === "string") return parsed;
			const plan = todos.replaceAll(parsed);
			const count = countItems(plan);
			return count
				? `Wrote the plan (${count} item(s)):\n${formatPlan(plan)}`
				: "Cleared the plan (user loose items and done steps are preserved when present).";
		}
		if (name === "todo_add") {
			const title = str(args.title)?.trim();
			if (!title) return "todo_add requires a title.";
			const group = str(args.group)?.trim() || undefined;
			const note = str(args.note) ?? undefined;
			const todo = todos.add({
				title,
				origin: "agent",
				...(group ? { group } : {}),
				...(note !== undefined ? { note } : {}),
			});
			return `Added ${GLYPH[todo.status]} ${todo.title} — ${todo.id}`;
		}
		if (name === "todo_update") {
			const id = str(args.id)?.trim();
			if (!id) return "todo_update requires an id.";
			const patch: {
				status?: TodoStatus;
				title?: string;
				note?: string;
			} = {};
			const status = asStatus(args.status);
			if (status) patch.status = status;
			const title = str(args.title)?.trim();
			if (title) patch.title = title;
			if (args.note !== undefined) patch.note = str(args.note) ?? "";
			if (Object.keys(patch).length === 0) return "todo_update needs status, title, and/or note.";
			const result = todos.update(id, patch);
			if (!result) return `No TODO with id "${id}".`;
			return `Updated ${GLYPH[result.todo.status]} ${result.todo.title} — ${result.todo.id}`;
		}
		if (name === "todo_remove") {
			const id = str(args.id)?.trim();
			if (!id) return "todo_remove requires an id.";
			const item = todos.get(id);
			if (!item) return `No TODO with id "${id}".`;
			if (item.origin === "user") {
				return `Refused: "${id}" was added by the user — do not remove it. Mark done via todo_update if finished.`;
			}
			if (item.status === "done") {
				return `Refused: "${id}" is done — completed steps stay as plan history.`;
			}
			todos.remove(id);
			return `Removed ${id}.`;
		}
	} catch (error) {
		return error instanceof Error ? error.message : "Todo tool failed.";
	}
	return `This desktop does not run ${name}.`;
}

/** Snapshot for tests: every item currently on disk for this IDE session. */
export function listPlanItemsForTest(
	workdir: string,
	ideSessionId: string,
): Array<{ id: string; title: string; origin: string; status: string }> {
	return flatItems(store(workdir, ideSessionId).read()).map((todo) => ({
		id: todo.id,
		title: todo.title,
		origin: todo.origin,
		status: todo.status,
	}));
}
