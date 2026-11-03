import { expect, test } from "@playwright/test";
import { seedAnalyticsConsent } from "./fixtures/analyticsConsent";

test("the analytics consent dialog stays unmounted; privacy remains in local settings", async ({
	page,
	baseURL,
}) => {
	await seedAnalyticsConsent(baseURL, false, false);
	await page.goto("/");
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
	await expect(page.getByTestId("analytics-consent-dialog")).toHaveCount(0);

	await page.getByTestId("open-settings").click();
	const dialog = page.getByTestId("settings-dialog");
	await expect(dialog).toBeVisible();
	await page.getByTestId("settings-nav-privacy").click();
	await expect(dialog).toContainText("Usage analytics");
	await expect(page.getByTestId("analytics-consent-dialog")).toHaveCount(0);
});
