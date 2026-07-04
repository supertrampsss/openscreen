import { expect, test } from "@playwright/test";

/**
 * Smoke Note vocale (§5.4, §6.1, §7) en MODE DÉMO + Premium simulé
 * (`?e2e=1&premium=1` : proxy absent → parse local marqué « démo »). Parcours :
 *   « + » → Note vocale → taper le texte exemple → « Interpréter » → entrées
 *   interprétées visibles (selle + symptôme + repas) → « Tout enregistrer » →
 *   le Journal contient les entrées et le repas.
 * Sélecteurs par testID (robustes à l'i18n).
 */

test("note vocale (démo, premium) : texte → entrées → journal", async ({ page }) => {
	await page.goto("/?e2e=1&premium=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-voice").click();

	// Champ texte (dictée clavier = STT système on-device) : on tape l'exemple.
	const input = page.getByTestId("voice-input");
	await expect(input).toBeVisible({ timeout: 10_000 });
	await input.fill(
		"3 selles liquides ce matin, douleur à 6 sur 10, j'ai mangé une raclette hier soir",
	);

	await page.getByTestId("voice-interpret").click();

	// Les entrées interprétées apparaissent (selle + symptôme + repas), + bannière démo.
	await expect(page.getByTestId("voice-review")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("voice-demo-banner")).toBeVisible();
	await expect(page.getByTestId("voice-entry-0")).toBeVisible();
	await expect(page.getByTestId("voice-entry-1")).toBeVisible();
	await expect(page.getByTestId("voice-entry-2")).toBeVisible();

	await page.getByTestId("voice-save-all").click();
	await expect(page.getByTestId("fab-add")).toBeVisible();

	// Le Journal contient les selles/symptôme (journal-entry) et le repas (journal-meal).
	await page.getByTestId("tab-journal").click();
	await expect(page.getByTestId("journal-entry").first()).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("journal-meal").first()).toBeVisible({ timeout: 10_000 });
});
