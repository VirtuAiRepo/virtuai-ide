import { expect, test } from "@playwright/test";

test("feedback and the product survey are not offered in the IDE", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");

	await expect(page.getByTestId("survey-invitation-dialog")).toHaveCount(0);
	await expect(page.getByTestId("survey-window")).toHaveCount(0);

	await page.getByTestId("open-settings").click();
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await expect(page.getByTestId("settings-nav-feedback")).toHaveCount(0);
	await expect(page.getByTestId("settings-feedback")).toHaveCount(0);
});
