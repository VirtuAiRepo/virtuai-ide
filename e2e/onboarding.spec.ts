import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { AppConfig } from "@thinkrail/contracts";
import { removeTree } from "@thinkrail/shared/removeTree";
import { openAppFresh, resetApp } from "./fixtures/app";
import { E2E_DATA_DIR, E2E_HOME_DIR } from "./fixtures/paths";
import { E2eWire } from "./fixtures/wire";

const PROJECTS_PARENT = join(E2E_HOME_DIR, "virtuai");
const CONFIG_PATH = join(E2E_DATA_DIR, "config.json");
const SETUP_PROMPT = "/skill:setting-up-a-project ";

function readConfig(): AppConfig | undefined {
	try {
		return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as AppConfig;
	} catch {
		return undefined;
	}
}

async function withWire<T>(
	baseURL: string | undefined,
	run: (wire: E2eWire) => Promise<T>,
): Promise<T> {
	if (!baseURL) throw new Error("Onboarding fixtures require the isolated host URL");
	const wire = await E2eWire.connect(Number(new URL(baseURL).port));
	try {
		return await run(wire);
	} finally {
		wire.close();
	}
}

function setOnboardingDismissed(
	baseURL: string | undefined,
	onboardingDismissed: boolean,
): Promise<AppConfig> {
	return withWire(baseURL, (wire) =>
		wire.request("settings.update", { config: { onboardingDismissed } }),
	);
}

async function signOutEveryProvider(wire: E2eWire): Promise<void> {
	const report = await wire.request("provider.status", {});
	for (const p of report.providers) {
		if (p.canLogout) await wire.request("provider.logout", { providerId: p.id });
	}
}

async function openColdStart(page: Page, baseURL: string | undefined): Promise<void> {
	await resetApp(page);
	const report = await withWire(baseURL, async (wire) => {
		await expect
			.poll(async () => (await wire.request("provider.status", {})).jbcentral.state, {
				timeout: 15_000,
			})
			.not.toBe("configuring");
		await signOutEveryProvider(wire);
		return wire.request("provider.status", {});
	});
	const configured = report.providers.filter((p) => p.configured);
	test.skip(
		configured.length > 0 && configured.every((p) => p.kind === "env"),
		"an ambient env provider makes this host a warm start",
	);
	expect(configured.map((p) => p.id)).toEqual([]);
	await page.goto("/");
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
}

test.afterEach(async ({ baseURL }) => {
	const cleanup = await Promise.allSettled([
		withWire(baseURL, signOutEveryProvider),
		setOnboardingDismissed(baseURL, true),
	]);
	removeTree(PROJECTS_PARENT);
	for (const step of cleanup) if (step.status === "rejected") throw step.reason;
});

test("Start a new project creates the repo under ~/virtuai and seeds the setup chat", async ({
	page,
}) => {
	await openAppFresh(page);

	await page.getByTestId("welcome-cta").filter({ hasText: "Start a new project" }).click();
	const dialog = page.getByTestId("create-project-dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByTestId("create-project-parent")).toHaveValue("~/virtuai");
	await dialog.getByTestId("create-project-name").fill("Weather App");
	await expect(dialog.getByTestId("create-project-path")).toHaveText("~/virtuai/weather-app");
	await expect(dialog.getByTestId("create-project-setup")).toHaveAttribute("aria-checked", "true");
	await dialog.getByTestId("create-project-submit").click();

	await expect(dialog).toHaveCount(0);
	await expect(page.getByTestId("chat-input")).toHaveValue(SETUP_PROMPT);
	await expect(page.getByTestId("new-workspace-dialog")).toHaveCount(0);
	expect(existsSync(join(PROJECTS_PARENT, "weather-app", ".git"))).toBe(true);
	await expect(page.getByTestId("project-item").filter({ hasText: "Weather App" })).toBeVisible();
});

test("the rail + starts a new project without the setup chat, and a taken folder errors inline", async ({
	page,
}) => {
	await openAppFresh(page);

	const create = async (name: string, setup: boolean) => {
		await page.getByTestId("add-project-menu").click();
		await page.getByTestId("menu-start-new-project").click();
		const dialog = page.getByTestId("create-project-dialog");
		await dialog.getByTestId("create-project-name").fill(name);
		if (!setup) await dialog.getByTestId("create-project-setup").click();
		await dialog.getByTestId("create-project-submit").click();
		return dialog;
	};

	const first = await create("notes", false);
	await expect(first).toHaveCount(0);
	await expect(page.getByTestId("new-workspace-dialog")).toHaveCount(0);
	await expect(page.getByTestId("welcome-title")).toHaveText("notes");
	await expect(page.getByTestId("welcome-cta")).toContainText("Set up project");

	const second = await create("notes", false);
	await expect(second.getByTestId("create-project-error")).toContainText("isn't empty");
	await expect(second).toBeVisible();
});


test("a cold start shows the local intro once, then Get started leaves it", async ({
	page,
	baseURL,
}) => {
	await setOnboardingDismissed(baseURL, false);
	await openColdStart(page, baseURL);

	const wizard = page.getByTestId("onboarding-wizard");
	await expect(wizard).toHaveAttribute("data-step", "intro");
	await expect(wizard.getByTestId("welcome-title")).toHaveText("VirtuAI");
	await expect(wizard.getByTestId("connect-provider-options")).toHaveCount(0);
	await wizard.getByTestId("onboarding-start").click();
	await expect(wizard).toHaveCount(0);
	await expect(page.getByTestId("welcome-cta")).toContainText("Start a new project");
	await expect.poll(() => readConfig()?.onboardingDismissed).toBe(true);

	await page.reload();
	await expect(page.getByTestId("welcome-cta")).toContainText("Start a new project");
	await expect(page.getByTestId("onboarding-wizard")).toHaveCount(0);
});

test("Skip setup on the local intro persists the same way", async ({ page, baseURL }) => {
	await setOnboardingDismissed(baseURL, false);
	await openColdStart(page, baseURL);

	const wizard = page.getByTestId("onboarding-wizard");
	await expect(wizard).toHaveAttribute("data-step", "intro");
	await wizard.getByTestId("onboarding-skip").click();
	await expect(wizard).toHaveCount(0);
	await expect(page.getByTestId("welcome-cta")).toContainText("Start a new project");
	await expect.poll(() => readConfig()?.onboardingDismissed).toBe(true);
});
