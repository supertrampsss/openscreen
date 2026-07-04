import { expect, type Page, test } from "@playwright/test";

/**
 * Smoke Home (§5.1) : après avoir loggé UNE selle, l'anneau de complétude reflète
 * le compte du jour (centre = 1), la flamme de streak passe à 1 (jour documenté)
 * et l'app reste cohérente. Sélecteurs par testID (robustes à l'i18n).
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

test("logger une selle remplit l'anneau et démarre la série", async ({ page }) => {
	await page.goto("/?e2e=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	// État initial : aucune selle aujourd'hui, série à 0.
	await expect(page.getByTestId("ring-stools")).toHaveText("0");
	await expect(page.getByTestId("streak-flame")).toContainText("0");

	await logStool(page, 4);

	// Le centre de l'anneau affiche 1 selle, la flamme passe à 1 jour documenté.
	await expect(page.getByTestId("ring-stools")).toHaveText("1");
	await expect(page.getByTestId("streak-flame")).toContainText("1");

	// La selle apparaît dans « Récemment loggé » (persistance intra-session).
	await page.getByTestId("tab-journal").click();
	await expect(page.getByTestId("journal-entry")).toHaveCount(1);
});

test("accepter le Bristol par défaut (dernier utilisé) et Enregistrer directement persiste bien la selle", async ({
	page,
}) => {
	// Régression revue Codex P1 : le défaut intelligent remplissait `bristol` sans
	// créer le brouillon — Enregistrer committait 0 ligne et la selle était perdue.
	await page.goto("/?e2e=1");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	// 1re selle : établit le « dernier Bristol utilisé ».
	await logStool(page, 5);
	await expect(page.getByTestId("ring-stools")).toHaveText("1");

	// 2e ouverture : le défaut est pré-rempli → Enregistrer DIRECT, sans taper de Bristol.
	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-stool").click();
	const save = page.getByTestId("stool-save");
	await expect(save).toBeEnabled(); // activé par le défaut intelligent
	await save.click();
	await expect(page.getByTestId("fab-add")).toBeVisible();

	// La 2e selle existe réellement (anneau + journal), même après reload.
	await expect(page.getByTestId("ring-stools")).toHaveText("2");
	await page.getByTestId("tab-journal").click();
	await expect(page.getByTestId("journal-entry")).toHaveCount(2);
	await page.reload();
	await page.getByTestId("tab-journal").click();
	await expect(page.getByTestId("journal-entry")).toHaveCount(2);
});
