import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "@playwright/test";
import {
	createWorkspaceViaDialog,
	openAppFresh,
	openFixtureProject,
	stagePlainFolder,
	worktreeRows,
} from "./fixtures/app";
import { git } from "./fixtures/git";
import { E2E_FIXTURE_REPO, E2E_PLAIN_DIR } from "./fixtures/paths";

const FIXTURE_SPECS = ["SPEC.md", join("module-a", "SPEC.md")];

test("opens a clean VirtuAI with no projects imported", async ({ page }) => {
	await openAppFresh(page);

	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect(page.getByTestId("center-tabs")).toHaveCount(0);
	await expect(page.getByTestId("right-panel")).toHaveCount(0);
	await expect(page.getByTestId("terminal-panel")).toHaveCount(0);

	await expect(page.getByTestId("welcome-title")).toHaveText("VirtuAI");
	await expect(page.getByTestId("onboarding-wizard")).toHaveCount(0);
	await expect(page.getByTestId("welcome-cta")).toContainText("Start a new project");
	await expect(page.getByTestId("welcome-action")).toHaveCount(1);

	await page.getByTestId("welcome-action").filter({ hasText: "Open project" }).click();
	await expect(page.getByTestId("menu-open-project")).toBeVisible();
});

test("the gear opens local appearance settings and offers no provider connection", async ({
	page,
}) => {
	await openAppFresh(page);

	await expect(page.getByTestId("welcome-provider-warning")).toHaveCount(0);
	await expect(page.getByTestId("welcome-connect-provider")).toHaveCount(0);

	await page.getByTestId("open-settings").click();
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await expect(page.getByTestId("settings-nav-appearance")).toHaveAttribute("data-active", "true");
	await expect(page.getByTestId("settings-nav-providers")).toHaveCount(0);
	await expect(page.getByTestId("settings-nav-models")).toHaveCount(0);
	await expect(page.getByTestId("provider-signin")).toHaveCount(0);
});

test("the Welcome trust notice names a project's Pi resources, grants them, and revokes on confirmation", async ({
	page,
}) => {
	const prompts = join(E2E_FIXTURE_REPO, ".pi", "prompts");
	mkdirSync(prompts, { recursive: true });
	writeFileSync(join(prompts, "e2e-kickoff.md"), "---\ndescription: Kick off\n---\nGo\n");
	try {
		await openFixtureProject(page);
		const notice = page.getByTestId("project-trust-notice");
		await expect(notice).toHaveAttribute("data-state", "untrusted");
		await expect(notice).toContainText("1 skill and its own Pi resources");
		await expect(page.getByTestId("project-trust-enables")).toHaveText("Trust loads its prompts.");
		await expect(page.getByTestId("project-untrust-button")).toHaveCount(0);

		await page.getByTestId("project-trust-button").click();
		await expect(notice).toHaveAttribute("data-state", "trusted");
		await expect(notice).toContainText("1 project skill trusted.");

		await page.getByTestId("project-untrust-button").click();
		await expect(page.getByRole("alertdialog")).toContainText(
			"Its project skills, Pi resources and MCP servers stop loading",
		);
		await page.getByTestId("project-untrust-confirm").click();
		await expect(notice).toHaveAttribute("data-state", "untrusted");
		await expect(page.getByTestId("project-untrust-button")).toHaveCount(0);
	} finally {
		rmSync(join(E2E_FIXTURE_REPO, ".pi"), { recursive: true, force: true });
	}
});

test("a project with specs offers Start building over Set up, beside the project-folder fork", async ({
	page,
}) => {
	await openFixtureProject(page);
	await expect(page.getByTestId("welcome-title")).toHaveText("sample-project");
	const scope = page.getByTestId("scope-context");
	await expect(scope).toHaveAttribute("data-context", "project-home");
	await expect(scope).toContainText("sample-project");
	await expect(scope).toContainText("Project home");
	await expect(page.getByTestId("welcome-cta")).toContainText("Start building");
	await expect(page.getByTestId("welcome-action")).toHaveCount(1);
	await expect(
		page.getByTestId("welcome-action").filter({ hasText: "Work in project folder" }),
	).toBeVisible();
	await expect(page.getByText("Set up project")).toHaveCount(0);
	await expect(page.getByTestId("welcome").getByText("Open project")).toHaveCount(0);
});

test("a project without specs suggests setting it up", async ({ page }) => {
	for (const spec of FIXTURE_SPECS) rmSync(join(E2E_FIXTURE_REPO, spec), { force: true });
	try {
		await openFixtureProject(page);
		await expect(page.getByTestId("welcome-title")).toHaveText("sample-project");
		await expect(page.getByTestId("welcome-cta")).toContainText("Set up project");
		await expect(page.getByTestId("welcome-action")).toHaveCount(2);
		await expect(
			page.getByTestId("welcome-action").filter({ hasText: "Start building" }),
		).toBeVisible();
		await expect(
			page.getByTestId("welcome-action").filter({ hasText: "Work in project folder" }),
		).toBeVisible();

		await page.getByTestId("welcome-cta").click();
		const dialog = page.getByTestId("new-workspace-dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog.getByTestId("ws-prompt")).toHaveValue("/skill:setting-up-a-project ");
		await expect(dialog.getByTestId("slash-menu")).toHaveCount(0);
		await expect(dialog.getByTestId("ws-target-worktree")).toHaveAttribute("data-active", "true");
		await expect(dialog.getByRole("heading", { name: "Create workspace" })).toBeVisible();
		await expect(dialog.getByTestId("ws-branch-picker")).toBeVisible();
		await expect(dialog.getByTestId("ws-prompt-note")).toContainText("setting-up-a-project skill");

		await dialog.getByTestId("ws-target-default").click();
		await expect(dialog.getByRole("heading", { name: "Work in project folder" })).toBeVisible();
		await expect(dialog).toContainText("no isolation");
		await expect(dialog.getByTestId("ws-branch-picker")).toHaveCount(0);

		await dialog.getByTestId("ws-prompt").fill("");
		await expect(page.getByTestId("create-workspace")).toHaveText(/Start/);
		await page.getByTestId("create-workspace").click();
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId("welcome")).toHaveCount(0);
		await expect(page.getByTestId("center-tabs")).toBeVisible();
		await expect(page.getByTestId("right-panel")).toBeVisible();
		await expect(page.getByTestId("terminal-panel")).toBeVisible();
		await expect(
			page.locator('[data-testid="workspace-item"][data-kind="default"]'),
		).toHaveAttribute("data-active", "true");
		await expect(worktreeRows(page)).toHaveCount(0);
	} finally {
		git(E2E_FIXTURE_REPO, "checkout", "--", ...FIXTURE_SPECS);
	}
});

test("opening a non-git folder from the Welcome screen offers to initialise a repo", async ({
	page,
}) => {
	await stagePlainFolder(page);
	await page.goto("/");
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(page.getByTestId("welcome")).toBeVisible();

	await page.getByTestId("welcome-action").filter({ hasText: "Open project" }).click();
	await page.getByTestId("menu-open-project").click();

	const confirmInit = page.getByTestId("confirm-init-repo");
	await expect(confirmInit).toBeVisible();
	await confirmInit.click();

	await expect(
		page.getByTestId("project-item").filter({ hasText: basename(E2E_PLAIN_DIR) }),
	).toBeVisible();
	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect(page.getByTestId("center-tabs")).toHaveCount(0);
	await expect(page.getByTestId("welcome-title")).toHaveText(basename(E2E_PLAIN_DIR));
	await expect(page.getByTestId("welcome-cta")).toContainText("Set up project");
	await expect(
		page.getByTestId("welcome-action").filter({ hasText: "Work in project folder" }),
	).toBeVisible();
});

test("clicking a project returns to its Welcome, deselecting the active workspace", async ({
	page,
}) => {
	await openFixtureProject(page);
	await createWorkspaceViaDialog(page);
	await expect(page.getByTestId("center-tabs")).toBeVisible();
	await expect(page.locator('[data-testid="workspace-item"][data-active="true"]')).toHaveCount(1);

	await page.getByTestId("project-item").first().getByText("sample-project").click();
	await expect(page.getByTestId("welcome")).toBeVisible();
	await expect(page.getByTestId("center-tabs")).toHaveCount(0);
	await expect(page.locator('[data-testid="workspace-item"][data-active="true"]')).toHaveCount(0);

	await worktreeRows(page).first().getByRole("button").first().click();
	await expect(page.getByTestId("center-tabs")).toBeVisible();
});
