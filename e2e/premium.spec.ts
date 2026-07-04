import { expect, test } from "@playwright/test";

/**
 * Paywall éthique (§8) : depuis Réglages → Premium, on vérifie les invariants
 * CONTRACTUELS anti-Cal AI :
 *   - les DEUX prix (mensuel + annuel) sont visibles DÈS l'ouverture ;
 *   - le bandeau d'engagement « gratuit pour toujours » est affiché (texte asserté) ;
 *   - fermer le paywall ne déclenche AUCUNE relance (pas de second flow).
 * Sélecteurs par testID (robustes à l'i18n).
 */

test("premium : prix + engagement affichés d'emblée, aucune relance à la fermeture", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	await page.getByTestId("tab-settings").click();
	await page.getByTestId("settings-premium").click();

	// Les deux prix sont là immédiatement (pas de prix dynamique caché).
	await expect(page.getByTestId("premium-price-monthly")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("premium-price-annual")).toBeVisible();
	// L'un contient le prix mensuel, l'autre le prix annuel placeholder.
	await expect(page.getByTestId("premium-price-monthly")).toContainText("4,99");
	await expect(page.getByTestId("premium-price-annual")).toContainText("29,99");

	// Bandeau d'engagement visible + texte exact (§8).
	const commitment = page.getByTestId("premium-commitment");
	await expect(commitment).toBeVisible();
	// Texte de l'engagement (fr « gratuits » / en « free »), robuste à la locale.
	await expect(commitment).toContainText(/gratuit|free/i);

	// Fermeture → retour Réglages, et AUCUN paywall relancé (pas de second flow).
	await page.getByTestId("premium-close").click();
	await expect(page.getByTestId("settings-premium")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("premium-continue")).toHaveCount(0);
});
