import { expect, test } from "@playwright/test";

/**
 * Smoke Tendances (§5.7) : l'écran s'affiche (sélecteur de période, bilan hebdo)
 * et le compte à rebours honnête des associations alimentaires est visible.
 */

test("l'écran Tendances s'affiche avec le compte à rebours des associations", async ({ page }) => {
	await page.goto("/?e2e=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	await page.getByTestId("tab-trends").click();

	// Sélecteur de période + bilan hebdo présents.
	await expect(page.getByTestId("period-30")).toBeVisible();
	await expect(page.getByTestId("period-90")).toBeVisible();
	await expect(page.getByTestId("trends-week")).toBeVisible();

	// Carte associations alimentaires avec son compte à rebours.
	const correlations = page.getByTestId("trends-correlations");
	await expect(correlations).toBeVisible();
	await expect(correlations).toContainText("14");

	// Bascule 90 j : l'écran reste stable.
	await page.getByTestId("period-90").click();
	await expect(page.getByTestId("trends-week")).toBeVisible();
});
