import type { Config } from "drizzle-kit";

/**
 * Configuration drizzle-kit — driver expo-sqlite.
 * Génère les migrations SQL versionnées dans `drizzle/` (commitées, §9).
 */
export default {
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	driver: "expo",
} satisfies Config;
