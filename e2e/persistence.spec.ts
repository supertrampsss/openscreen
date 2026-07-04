import { expect, type Page, test } from "@playwright/test";

/**
 * Smoke de persistance (§9, §12, §5.2) : on enregistre 3 selles rapides, on
 * vérifie qu'elles apparaissent au Journal, PUIS on recharge la page et on
 * vérifie qu'elles SONT TOUJOURS LÀ — preuve que le stockage SQLite web
 * (expo-sqlite WASM + OPFS, activé par les en-têtes COOP/COEP du serveur)
 * persiste au-delà d'un rechargement.
 *
 * Sélecteurs : testID (→ data-testid sur react-native-web), robustes à l'i18n.
 */

/** Enregistre une selle rapide : + → Selle → Bristol N (+ options) → Enregistrer. */
async function logStool(page: Page, bristol: number, opts?: { urgency?: number }) {
	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-stool").click();
	await page.getByTestId(`bristol-${bristol}`).click();
	if (opts?.urgency != null) {
		await page.getByTestId(`urgency-${opts.urgency}`).click();
	}
	const save = page.getByTestId("stool-save");
	await expect(save).toBeEnabled();
	await save.click();
	// Le sheet se referme → le bouton + redevient l'élément de tête.
	await expect(page.getByTestId("fab-add")).toBeVisible();
}

test("les selles enregistrées persistent après un reload", async ({ page }) => {
	// ① Ouvre l'app → attend que les migrations soient passées (Home rendu).
	await page.goto("/");
	await expect(page.getByTestId("fab-add")).toBeVisible({ timeout: 30_000 });

	// ②③ Enregistre 3 selles (Bristol 4 ; Bristol 6 + urgence ; Bristol 3).
	await logStool(page, 4);
	await logStool(page, 6, { urgency: 2 });
	await logStool(page, 3);

	// ④ Onglet Journal → 3 entrées visibles (persistance intra-session).
	await page.getByTestId("tab-journal").click();
	await expect(page.getByTestId("journal-entry")).toHaveCount(3);

	// ⑤ Reload → Journal → les 3 entrées SONT TOUJOURS LÀ (persistance SQLite).
	await page.reload();
	await expect(
		page.getByTestId("fab-add").or(page.getByTestId("journal-entry").first()),
	).toBeVisible({ timeout: 30_000 });
	await page.getByTestId("tab-journal").click();
	await expect(page.getByTestId("journal-entry")).toHaveCount(3);
});
