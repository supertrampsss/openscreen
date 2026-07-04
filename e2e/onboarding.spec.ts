import { expect, test } from "@playwright/test";

/**
 * Funnel d'onboarding (§4) : sans le semis `?e2e=1`, le gate redirige « / » vers
 * le funnel. On parcourt les 16 écrans au clic (Crohn, on saute ce qui est
 * skippable, on pique un choix sur les écrans mono-select requis), on vérifie
 * que l'écran 16 propose bien « Continuer gratuitement » (§4.16), puis qu'on
 * arrive aux tabs (onboarding_done). Sélecteurs par testID (robustes à l'i18n).
 */

test("parcours complet → arrive aux tabs avec onboarding terminé", async ({ page }) => {
	await page.goto("/");

	// Écran 1 : splash + animation → Commencer.
	await expect(page.getByTestId("onboarding-continue")).toBeVisible({ timeout: 30_000 });
	await page.getByTestId("onboarding-continue").click();

	// Écran 2 : diagnostic (requis) → Crohn.
	await page.getByTestId("onb-opt-crohn").click();
	await page.getByTestId("onboarding-continue").click();

	// Écran 3 : année → Passer.
	await page.getByTestId("onboarding-skip").click();

	// Écran 4 : état (requis) → rémission.
	await page.getByTestId("onb-opt-remission").click();
	await page.getByTestId("onboarding-continue").click();

	// Écran 5 : fréquence de selles (requis) → 3-5.
	await page.getByTestId("onb-opt-3-5").click();
	await page.getByTestId("onboarding-continue").click();

	// Écran 6 : symptômes → Passer.
	await page.getByTestId("onboarding-skip").click();

	// Écran 7 : traitement → Passer.
	await page.getByTestId("onboarding-skip").click();

	// Écran 8 : interstitiel preuve → Continuer.
	await page.getByTestId("onboarding-continue").click();

	// Écran 9 : objectifs → Passer.
	await page.getByTestId("onboarding-skip").click();

	// Écran 10 : obstacles → Passer.
	await page.getByTestId("onboarding-skip").click();

	// Écran 11 : attribution → Passer.
	await page.getByTestId("onboarding-skip").click();

	// Écran 12 : notifications → Plus tard.
	await page.getByTestId("onboarding-notif-later").click();

	// Écran 13 : Apple Health / Fit → Passer.
	await page.getByTestId("onboarding-skip").click();

	// Écran 14 : calcul animé (auto ~2,5 s) → écran 15 : plan prêt → Continuer.
	await expect(page.getByTestId("onboarding-continue")).toBeVisible({ timeout: 15_000 });
	await page.getByTestId("onboarding-continue").click();

	// Écran 16 : paywall SOFT — « Continuer gratuitement » visible (§4.16 contractuel).
	await expect(page.getByTestId("premium-continue-free")).toBeVisible({ timeout: 10_000 });
	await expect(page.getByTestId("premium-try")).toBeVisible();
	await page.getByTestId("premium-continue-free").click();

	// → tabs, onboarding terminé.
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 15_000 });
});
