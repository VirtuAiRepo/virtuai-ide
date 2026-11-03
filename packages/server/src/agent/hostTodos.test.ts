import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STORE_DIR, TodoStore } from "pi-todos/core";
import { applyTodoHostCall, listPlanItemsForTest } from "./hostTodos";
import { planStoreRel } from "./planSession";

const SESSION = "ide-todo-phase2";

function workdir(): string {
	return mkdtempSync(join(tmpdir(), "host-todos-"));
}

test("todo_write lands on the IDE session file and preserves user-origin loose items", () => {
	const root = workdir();
	new TodoStore(root, SESSION).add({ title: "Keep my ask", origin: "user" });

	const wrote = applyTodoHostCall(
		"todo_write",
		{
			groups: [
				{
					title: "Ship auth",
					todos: [
						{ title: "Add login route" },
						{ title: "Wire session cookie", status: "pending" },
					],
				},
			],
		},
		root,
		SESSION,
	);
	expect(wrote).toContain("Wrote the plan");
	expect(wrote).toContain("Ship auth");

	const onDisk = JSON.parse(readFileSync(join(root, planStoreRel(SESSION)), "utf8")) as {
		todos: Array<{ title: string; origin: string }>;
		groups: unknown[];
	};
	expect(onDisk.todos.some((todo) => todo.title === "Keep my ask" && todo.origin === "user")).toBe(
		true,
	);
	const titles = listPlanItemsForTest(root, SESSION).map((todo) => todo.title);
	expect(titles).toContain("Keep my ask");
	expect(titles).toContain("Add login route");
	expect(titles).toContain("Wire session cookie");
	expect(planStoreRel(SESSION)).toBe(`${STORE_DIR}/${SESSION}.json`);
});

test("todo_list / todo_update / todo_add / todo_remove cover the agent loop", () => {
	const root = workdir();
	applyTodoHostCall(
		"todo_write",
		{ groups: [{ title: "Task", todos: [{ title: "Step one" }, { title: "Step two" }] }] },
		root,
		SESSION,
	);
	const listed = applyTodoHostCall("todo_list", {}, root, SESSION);
	expect(listed).toContain("Step one");

	const items = listPlanItemsForTest(root, SESSION);
	const first = items.find((todo) => todo.title === "Step one");
	expect(first).toBeDefined();
	expect(
		applyTodoHostCall(
			"todo_update",
			{ id: first!.id, status: "in_progress" },
			root,
			SESSION,
		),
	).toContain("[~]");

	expect(applyTodoHostCall("todo_add", { title: "Loose agent note" }, root, SESSION)).toContain(
		"Added",
	);
	const agentLoose = listPlanItemsForTest(root, SESSION).find(
		(todo) => todo.title === "Loose agent note",
	);
	expect(agentLoose?.origin).toBe("agent");
	expect(applyTodoHostCall("todo_remove", { id: agentLoose!.id }, root, SESSION)).toContain(
		"Removed",
	);

	new TodoStore(root, SESSION).add({ title: "User locked", origin: "user" });
	const user = listPlanItemsForTest(root, SESSION).find((todo) => todo.title === "User locked");
	expect(applyTodoHostCall("todo_remove", { id: user!.id }, root, SESSION)).toMatch(/Refused/);
});
