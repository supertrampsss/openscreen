import { expect, test } from "@playwright/test";

/**
 * Smoke Repas manuel (§5.5) : ouvrir le bouton « + » → Repas manuel → rechercher
 * un aliment → l'ajouter → Enregistrer → le repas apparaît dans le Journal avec
 * ses chips de triggers agrégées. Sélecteurs par testID (robustes à l'i18n).
 */

test("logger un repas manuel via la recherche d'aliments", async ({ page }) => {
	await page.goto("/?e2e=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-meal").click();

	// Recherche « riz » → résultats live. « Riz complet » porte le trigger fibres.
	const search = page.getByTestId("meal-search");
	await expect(search).toBeVisible();
	await search.fill("riz complet");
	const result = page.getByText("Riz complet", { exact: true });
	await expect(result).toBeVisible({ timeout: 10_000 });
	await result.click();

	// L'item est sélectionné → Enregistrer devient actif.
	const save = page.getByTestId("meal-save");
	await expect(save).toBeEnabled();
	await save.click();
	await expect(page.getByTestId("fab-add")).toBeVisible();

	// Le repas apparaît dans le Journal avec ses chips triggers agrégées.
	await page.getByTestId("tab-journal").click();
	const meal = page.getByTestId("journal-meal").first();
	await expect(meal).toBeVisible();
	await expect(meal.getByTestId("meal-trigger-chips")).toBeVisible();
});
