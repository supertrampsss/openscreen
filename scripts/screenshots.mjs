/**
 * Captures d'écran automatisées (§12 / ASO) — pilote l'export web E2E avec
 * Playwright, seed des données réalistes VIA L'UI (aucun accès DB direct), et
 * produit les PNG de `docs/screenshots/` qui servent le README et l'ASO.
 *
 * Autonome : ① construit `dist/` avec le seed E2E (`build:web:e2e`) s'il manque,
 * ② lance `scripts/serve-web.mjs` (en-têtes COOP/COEP requis par le WASM
 * d'expo-sqlite), ③ pilote un Chromium mobile (390×844 @2x — pointé par
 * `PW_CHROMIUM_PATH` s'il est défini, sinon le binaire Playwright par défaut),
 * ④ capture les écrans clés en clair + une variante Home en sombre.
 *
 *   node scripts/screenshots.mjs   (ou : npm run screenshots)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const OUT = resolve(ROOT, "docs/screenshots");
const PORT = Number(process.env.PORT ?? 4319);
const BASE = `http://localhost:${PORT}`;
const SEED = `${BASE}/?e2e=1&premium=1`;

/** Viewport mobile façon iPhone 12/13 (390×844) en densité 2. */
const MOBILE = {
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 2,
	isMobile: true,
	hasTouch: true,
};

/** ① Construit l'export web E2E si `dist/` est absent. */
function ensureDist() {
	if (existsSync(resolve(DIST, "index.html"))) {
		console.log("dist/ présent — réutilisation.");
		return;
	}
	console.log("dist/ absent — build:web:e2e…");
	const r = spawnSync("npm", ["run", "build:web:e2e"], { cwd: ROOT, stdio: "inherit" });
	if (r.status !== 0) throw new Error("build:web:e2e a échoué");
}

/** ② Démarre le serveur statique et attend qu'il réponde. */
async function startServer() {
	const proc = spawn("node", ["scripts/serve-web.mjs"], {
		cwd: ROOT,
		env: { ...process.env, PORT: String(PORT) },
		stdio: ["ignore", "inherit", "inherit"],
	});
	for (let i = 0; i < 100; i++) {
		try {
			const res = await fetch(BASE);
			if (res.ok) return proc;
		} catch {
			// pas encore prêt
		}
		await sleep(150);
	}
	proc.kill();
	throw new Error("serve-web n'a pas démarré");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Attend que l'app soit montée (migrations passées → Home rendu). */
async function waitApp(page) {
	await page.getByTestId("fab-add").waitFor({ state: "visible", timeout: 45_000 });
	await sleep(400); // laisse les animations/anneau se stabiliser
}

/** Selle rapide : + → Selle → Bristol N (+ urgence optionnelle) → Enregistrer. */
async function logStool(page, bristol, urgency) {
	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-stool").click();
	await page.getByTestId(`bristol-${bristol}`).click();
	if (urgency != null) await page.getByTestId(`urgency-${urgency}`).click();
	await page.getByTestId("stool-save").click();
	await page.getByTestId("fab-add").waitFor({ state: "visible" });
	await sleep(150);
}

/** Symptômes : + → Symptômes → forme générale N → Enregistrer. */
async function logSymptom(page, wellbeing) {
	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-symptom").click();
	await page.getByTestId(`wellbeing-${wellbeing}`).click();
	await page.getByTestId("symptom-save").click();
	await page.getByTestId("fab-add").waitFor({ state: "visible" });
	await sleep(150);
}

/** Repas manuel : + → Repas → recherche → sélection → Enregistrer. */
async function logMeal(page, query, exactName) {
	await page.getByTestId("fab-add").click();
	await page.getByTestId("add-action-meal").click();
	const search = page.getByTestId("meal-search");
	await search.waitFor({ state: "visible" });
	await search.fill(query);
	const result = page.getByText(exactName, { exact: true });
	await result.waitFor({ state: "visible", timeout: 10_000 });
	await result.click();
	await page.getByTestId("meal-save").click();
	await page.getByTestId("fab-add").waitFor({ state: "visible" });
	await sleep(150);
}

async function shot(page, name) {
	const file = resolve(OUT, name);
	await page.screenshot({ path: file });
	const kb = Math.round(statSync(file).size / 1024);
	console.log(`  ✓ ${name} (${kb} Ko)`);
}

async function main() {
	ensureDist();
	mkdirSync(OUT, { recursive: true });
	const server = await startServer();
	const browser = await chromium.launch({
		executablePath: process.env.PW_CHROMIUM_PATH || undefined,
	});

	try {
		// ── Contexte principal : seed E2E + Premium simulé, mode clair ──────────
		const ctx = await browser.newContext({ ...MOBILE, colorScheme: "light", locale: "fr-FR" });
		const page = await ctx.newPage();
		await page.goto(SEED);
		await waitApp(page);

		// ③ Seed réaliste VIA L'UI : 4 selles variées + 1 symptôme + 1 repas manuel.
		await logStool(page, 4);
		await logStool(page, 6, 2);
		await logStool(page, 3);
		await logStool(page, 5, 1);
		await logSymptom(page, 1); // forme générale « bonne »
		await logMeal(page, "riz complet", "Riz complet");
		await sleep(3600); // laisse le snackbar de confirmation se dissiper (auto-hide 3,2 s)

		// ④ Home (avec données).
		await page.getByTestId("tab-home").click();
		await sleep(500);
		await shot(page, "home.png");

		// Journal.
		await page.getByTestId("tab-journal").click();
		await sleep(400);
		await shot(page, "journal.png");

		// Tendances (courbes visibles).
		await page.getByTestId("tab-trends").click();
		await sleep(700);
		await shot(page, "trends.png");

		// Export médecin.
		await page.getByTestId("tab-settings").click();
		await page.getByTestId("settings-export").click();
		await page.getByTestId("export-period-1").waitFor({ state: "visible", timeout: 15_000 });
		await sleep(500);
		await shot(page, "export.png");

		// Premium (paywall) — contexte propre pour repartir de Réglages.
		await page.goto(SEED);
		await waitApp(page);
		await page.getByTestId("tab-settings").click();
		await page.getByTestId("settings-premium").click();
		await page.getByTestId("premium-price-monthly").waitFor({ state: "visible", timeout: 15_000 });
		await sleep(500);
		await shot(page, "premium.png");

		// Urgence — carte plein écran, message FR.
		await page.goto(SEED);
		await waitApp(page);
		await page.getByTestId("tab-urgence").click();
		await page.getByTestId("urgence-open").waitFor({ state: "visible", timeout: 15_000 });
		await page.getByTestId("urgence-open").click();
		await page.getByTestId("urgence-message").waitFor({ state: "visible", timeout: 15_000 });
		await page.getByTestId("urgence-lang-fr").click();
		await sleep(400);
		await shot(page, "urgence.png");

		// ⑤ Variante Home sombre (émulation prefers-color-scheme: dark).
		await page.goto(SEED);
		await waitApp(page);
		await page.emulateMedia({ colorScheme: "dark" });
		await page.getByTestId("tab-home").click();
		await sleep(700);
		await shot(page, "home-dark.png");

		await ctx.close();

		// ── Onboarding : contexte SÉPARÉ (OPFS vierge) sans `?e2e` → funnel ─────
		const onbCtx = await browser.newContext({ ...MOBILE, colorScheme: "light", locale: "fr-FR" });
		const onb = await onbCtx.newPage();
		await onb.goto(`${BASE}/`);
		await onb.getByTestId("onboarding-continue").waitFor({ state: "visible", timeout: 45_000 });
		await sleep(700);
		await shot(onb, "onboarding.png");
		await onbCtx.close();
	} finally {
		await browser.close();
		server.kill();
	}

	console.log(`\nCaptures écrites dans ${OUT}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
