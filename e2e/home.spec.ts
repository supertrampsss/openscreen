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
	await page.goto("/");
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
