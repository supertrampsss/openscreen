import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest — suites du domaine PUR (§9) et des migrations SQL, exécutées sous Node
 * (aucun mock RN nécessaire). Le futur `server/` (Worker IA, PR5) est déjà inclus.
 */
export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		environment: "node",
		include: ["src/domain/**/*.test.ts", "src/db/**/*.test.ts", "server/**/*.test.ts"],
	},
});
