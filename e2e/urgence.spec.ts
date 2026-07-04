import { expect, test } from "@playwright/test";

/**
 * Smoke Urgence (§5.10) : onglet Urgence → gros bouton → carte d'urgence plein
 * écran avec le message FR → bascule ES → message espagnol. La géolocalisation est
 * mockée en REFUS : le bouton « Trouver les toilettes » affiche un message propre
 * et la carte d'urgence reste accessible.
 *
 * Sélecteurs par testID (robustes à l'i18n) ; les 5 messages d'urgence sont en dur.
 */
test("carte d'urgence multilingue + refus de localisation géré (web)", async ({ page }) => {
	// Géolocalisation navigateur = refus systématique (callback d'erreur), sans
	// redéfinir tout l'objet navigator.geolocation (juste la méthode utilisée).
	await page.addInitScript(() => {
		try {
			if (navigator.geolocation) {
				navigator.geolocation.getCurrentPosition = (
					_ok: PositionCallback,
					err?: PositionErrorCallback | null,
				) => {
					err?.({ code: 1, message: "denied" } as GeolocationPositionError);
				};
			}
		} catch {
			// no-op : ne jamais casser le chargement de l'app.
		}
	});

	await page.goto("/?e2e=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	// Onglet Urgence → gros bouton « CARTE D'URGENCE ».
	await page.getByTestId("tab-urgence").click();
	await expect(page.getByTestId("urgence-open")).toBeVisible({ timeout: 15_000 });
	await page.getByTestId("urgence-open").click();

	// Carte plein écran ; bascule FR → message français (indépendant de la langue app).
	const message = page.getByTestId("urgence-message");
	await expect(message).toBeVisible({ timeout: 15_000 });
	await page.getByTestId("urgence-lang-fr").click();
	await expect(message).toContainText("maladie chronique intestinale");

	// Bascule ES → message espagnol.
	await page.getByTestId("urgence-lang-es").click();
	await expect(message).toContainText("enfermedad intestinal crónica");

	// Retour à l'onglet.
	await page.getByTestId("urgence-back").click();
	await expect(page.getByTestId("urgence-open")).toBeVisible({ timeout: 15_000 });

	// Localisation refusée → message propre affiché, carte toujours accessible.
	await page.getByTestId("toilets-enable").click();
	await expect(page.getByTestId("toilets-denied")).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId("urgence-open")).toBeVisible();
});
