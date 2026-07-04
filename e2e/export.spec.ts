import { expect, type Page, test } from "@playwright/test";

/**
 * Smoke Export médecin (§5.8) : on seed via l'UI (1 selle + 1 symptôme), on ouvre
 * Réglages → Export médecin, on choisit 1 mois, l'aperçu affiche au moins un point
 * à consulter (ou le repli), puis « Générer » déclenche — sur web — l'ouverture du
 * HTML dans un nouvel onglet (blob URL). `window.open` est mocké via addInitScript.
 *
 * Sélecteurs par testID (robustes à l'i18n).
 */

async function logStool(page: Page, bristol: number) {
	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-stool").click();
	await page.getByTestId(`bristol-${bristol}`).click();
	const save = page.getByTestId("stool-save");
	await expect(save).toBeEnabled();
	await save.click();
	await expect(page.getByTestId("fab-add")).toBeVisible();
}

async function logSymptom(page: Page, wellbeing: number) {
	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-symptom").click();
	await page.getByTestId(`wellbeing-${wellbeing}`).click();
	const save = page.getByTestId("symptom-save");
	await expect(save).toBeEnabled();
	await save.click();
	await expect(page.getByTestId("fab-add")).toBeVisible();
}

test("l'export médecin construit un aperçu et déclenche la génération (web)", async ({ page }) => {
	// Mock window.open AVANT tout chargement : enregistre les appels, renvoie un
	// objet non-null pour que le service considère l'ouverture réussie.
	await page.addInitScript(() => {
		const store = window as unknown as { __openCalls: string[] };
		store.__openCalls = [];
		const noop = () => undefined;
		window.open = ((url?: string | URL) => {
			store.__openCalls.push(String(url ?? ""));
			return { closed: false, focus: noop, close: noop } as unknown as Window;
		}) as typeof window.open;
	});

	await page.goto("/?e2e=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	// Seed : 1 selle + 1 symptôme → au moins un jour documenté.
	await logStool(page, 4);
	await logSymptom(page, 1);

	// Réglages → carte Export médecin → écran d'export.
	await page.getByTestId("tab-settings").click();
	await page.getByTestId("settings-export").click();

	// Sélecteur de période présent ; 1 mois par défaut.
	await expect(page.getByTestId("export-period-1")).toBeVisible({ timeout: 15_000 });
	await page.getByTestId("export-period-1").click();

	// L'aperçu affiche la carte des points à consulter (≥1 point ou repli).
	const consult = page.getByTestId("export-consult");
	await expect(consult).toBeVisible();
	await expect(consult).not.toBeEmpty();

	// Générer → sur web, ouvre le HTML (blob:) dans un nouvel onglet.
	await page.getByTestId("export-generate").click();

	await expect
		.poll(async () =>
			page.evaluate(() => (window as unknown as { __openCalls: string[] }).__openCalls.length),
		)
		.toBeGreaterThan(0);

	const openedUrl = await page.evaluate(
		() => (window as unknown as { __openCalls: string[] }).__openCalls[0],
	);
	expect(openedUrl).toContain("blob:");
});
