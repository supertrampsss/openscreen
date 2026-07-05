import { expect, test } from "@playwright/test";

/**
 * Consentement à l'analyse par IA tierce (§2 loi 4, App Store §5.1.2).
 *
 * Au PREMIER envoi IA sans consentement pré-accordé (`?noaiconsent=1` empêche le
 * semis E2E de l'accorder), la feuille de consentement doit s'afficher AVANT tout
 * accès à la galerie / envoi. « Annuler » n'enclenche aucun scan. Le parcours
 * complet (accepter → scan) reste couvert par `scan.spec.ts` (consentement semé).
 * Sélecteurs par testID (robustes à l'i18n).
 */

test("consentement IA : le sheet s'affiche au 1er scan, Annuler n'envoie rien", async ({
	page,
}) => {
	await page.goto("/?e2e=1&noaiconsent=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-photo").click();

	// La feuille de consentement précède tout accès galerie / envoi.
	await expect(page.getByTestId("ai-consent-accept")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("ai-consent-cancel")).toBeVisible();

	// « Annuler » : aucun scan lancé, la feuille se ferme.
	await page.getByTestId("ai-consent-cancel").click();
	await expect(page.getByTestId("ai-consent-accept")).toHaveCount(0);
	await expect(page.getByTestId("scan-shimmer")).toHaveCount(0);
});
