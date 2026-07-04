import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright — smoke E2E web (§9, §12) : persistance SQLite après reload.
 * Sert l'export statique Expo (`dist/`) via `scripts/serve-web.mjs` (en-têtes
 * COOP/COEP requis par le WASM d'expo-sqlite). Chromium seul.
 */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 1,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: "http://localhost:4173",
		trace: "on-first-retry",
		// PW_CHROMIUM_PATH permet de pointer un Chromium pré-installé (environnements
		// hors ligne). Non défini en CI → Playwright utilise le binaire qu'il installe.
		launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "node scripts/serve-web.mjs",
		url: "http://localhost:4173",
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
