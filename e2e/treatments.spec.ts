import { expect, test } from "@playwright/test";

/**
 * Smoke Traitements (§5.9) : Réglages → Traitements → ajouter « Adalimumab »
 * injectable toutes les 2 semaines → le traitement apparaît avec son échéance →
 * « Fait ✓ » enregistre une prise → l'observance s'affiche (1 prise sur 6).
 *
 * Sélecteurs par testID (robustes à l'i18n).
 */
test("ajout d'un traitement, prise et observance (web)", async ({ page }) => {
	await page.goto("/?e2e=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	// Réglages → carte Traitements → écran Traitements.
	await page.getByTestId("tab-settings").click();
	await page.getByTestId("settings-treatments").click();

	// Formulaire d'ajout.
	await page.getByTestId("treatments-add").click();
	await page.getByTestId("treatment-name-input").fill("Adalimumab");
	await page.getByTestId("treatment-kind-biologic_injection").click();
	await page.getByTestId("treatment-cadence-2").click();

	const save = page.getByTestId("treatment-save");
	await expect(save).toBeEnabled();
	await save.click();

	// Le traitement apparaît avec son nom et une échéance.
	const item = page.getByTestId("treatment-item").first();
	await expect(item).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId("treatment-name").first()).toHaveText("Adalimumab");

	// « Fait ✓ » → prise enregistrée → l'observance passe à 1 prise attendue sur 6.
	await page.getByTestId("treatment-mark-taken").first().click();

	const adherence = page.getByTestId("treatment-adherence").first();
	await expect(adherence).toBeVisible();
	await expect(adherence).toContainText("1/6");
});
