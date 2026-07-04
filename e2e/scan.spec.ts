import { expect, test } from "@playwright/test";

/**
 * Smoke Scan photo (§5.4) en MODE DÉMO (aucune URL de proxy dans l'export web
 * → réponse simulée après ~1,5 s, marquée « démo »). Parcours :
 *   « + » → Photo repas → (web = galerie : filechooser + fixture) → shimmer
 *   « Analyse… » dans Récemment loggé → sheet résultat (plat démo + chips +
 *   bannière démo) → « C'est bon » → le repas apparaît au Journal.
 * Sélecteurs par testID (robustes à l'i18n).
 */

test("scan photo (mode démo) : shimmer → résultat → journal", async ({ page }) => {
	await page.goto("/?e2e=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	await page.getByTestId("fab-add").click();

	// La galerie web ouvre un <input type=file> → filechooser interceptable.
	const [chooser] = await Promise.all([
		page.waitForEvent("filechooser"),
		page.getByTestId("add-action-photo").click(),
	]);
	await chooser.setFiles("e2e/fixtures/meal.jpg");

	// Le brouillon apparaît immédiatement avec un shimmer « Analyse… ».
	await expect(page.getByTestId("scan-shimmer")).toBeVisible({ timeout: 10_000 });

	// ~1,5 s plus tard : le sheet de résultat démo s'ouvre.
	await expect(page.getByTestId("scan-confirm")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("scan-demo-banner")).toBeVisible();
	await expect(page.getByTestId("scan-ingredients")).toBeVisible();
	// Au moins un ingrédient détecté avec ses chips.
	await expect(page.locator('[data-testid^="scan-item-"]').first()).toBeVisible();

	await page.getByTestId("scan-confirm").click();
	await expect(page.getByTestId("fab-add")).toBeVisible();

	// Le repas photo confirmé apparaît au Journal.
	await page.getByTestId("tab-journal").click();
	await expect(page.getByTestId("journal-meal").first()).toBeVisible({ timeout: 10_000 });
});
