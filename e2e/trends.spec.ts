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

	// Insight IA hebdo (§7) : non-Premium → teaser discret (jamais imposé).
	await expect(page.getByTestId("insight-teaser")).toBeVisible();
	await expect(page.getByTestId("insight-card")).toHaveCount(0);

	// Bascule 90 j : l'écran reste stable.
	await page.getByTestId("period-90").click();
	await expect(page.getByTestId("trends-week")).toBeVisible();
});

test("insight IA hebdo (démo, premium) : carte générée avec agrégats anonymes", async ({
	page,
}) => {
	await page.goto("/?e2e=1&premium=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	// On documente une selle pour que la semaine ait des données (sinon carte vide).
	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-stool").click();
	await page.getByTestId("bristol-6").click();
	await page.getByTestId("stool-save").click();

	await page.getByTestId("tab-trends").click();
	// Premium → carte insight (pas de teaser), avec un corps généré (mode démo).
	await expect(page.getByTestId("insight-card")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("insight-body")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("insight-teaser")).toHaveCount(0);
});
