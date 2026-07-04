import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import seed from "@/data/foods.seed.json";
import {
	BOOLEAN_TRIGGER_KEYS,
	FODMAP_LEVELS,
	NORMALIZED_NAME_PATTERN,
	normalizeFoodName,
} from "@/domain/foods";

/**
 * Tests du seed d'aliments FR (§5.5) :
 *  1. Validation du fichier JSON entier contre le schéma triggers (9 attributs,
 *     fodmap ∈ {low,medium,high}), ≥280 items, name_normalized unique & normalisé.
 *  2. Idempotence de l'insertion : rejouer le seed via `INSERT ... ON CONFLICT
 *     DO NOTHING` (better-sqlite3, même moteur qu'expo-sqlite) ne crée aucun
 *     doublon — miroir SQL de `seedFoods.onConflictDoNothing(name_normalized)`.
 */

interface SeedItem {
	name_normalized: string;
	display_fr: string;
	triggers: Record<string, unknown>;
}

const items = seed as SeedItem[];

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");
function applyMigrations(db: Database.Database): void {
	const files = readdirSync(drizzleDir)
		.filter((f) => f.endsWith(".sql"))
		.sort();
	for (const file of files) {
		const sql = readFileSync(join(drizzleDir, file), "utf8");
		for (const stmt of sql.split("--> statement-breakpoint")) {
			const trimmed = stmt.trim();
			if (trimmed) db.exec(trimmed);
		}
	}
}

describe("foods.seed.json — schéma & normalisation", () => {
	it("contient au moins 280 aliments", () => {
		expect(items.length).toBeGreaterThanOrEqual(280);
	});

	it("chaque item a name_normalized, display_fr et les 9 attributs triggers", () => {
		for (const item of items) {
			expect(typeof item.name_normalized).toBe("string");
			expect(item.display_fr.length).toBeGreaterThan(0);
			const t = item.triggers;
			// fodmap ∈ {low, medium, high}
			expect(FODMAP_LEVELS).toContain(t.fodmap);
			// les 8 booléens présents et de type boolean
			for (const key of BOOLEAN_TRIGGER_KEYS) {
				expect(typeof t[key], `${item.name_normalized}.${key}`).toBe("boolean");
			}
			// exactement 9 clés (schéma figé, aucune clé superflue)
			expect(Object.keys(t)).toHaveLength(9);
		}
	});

	it("name_normalized est effectivement normalisé (minuscules, sans accents)", () => {
		for (const item of items) {
			expect(item.name_normalized, item.name_normalized).toMatch(NORMALIZED_NAME_PATTERN);
			// idempotence : déjà sous forme normale
			expect(normalizeFoodName(item.name_normalized)).toBe(item.name_normalized);
			// cohérent avec le nom affiché
			expect(normalizeFoodName(item.display_fr)).toBe(item.name_normalized);
		}
	});

	it("name_normalized est unique sur tout le seed", () => {
		const names = items.map((i) => i.name_normalized);
		expect(new Set(names).size).toBe(names.length);
	});
});

describe("seedFoods — idempotence en base", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(":memory:");
		db.pragma("foreign_keys = ON");
		applyMigrations(db);
	});

	function runSeed(): void {
		const insert = db.prepare(
			`INSERT INTO foods (id, name_normalized, display_fr, triggers, is_custom)
			 VALUES (@id, @name, @display, @triggers, 0)
			 ON CONFLICT(name_normalized) DO NOTHING`,
		);
		const tx = db.transaction((rows: SeedItem[]) => {
			for (const [i, item] of rows.entries()) {
				insert.run({
					id: `seed-${i}`,
					name: item.name_normalized,
					display: item.display_fr,
					triggers: JSON.stringify(item.triggers),
				});
			}
		});
		tx(items);
	}

	it("un seul passage insère tous les aliments", () => {
		runSeed();
		const count = (db.prepare("SELECT COUNT(*) AS n FROM foods").get() as { n: number }).n;
		expect(count).toBe(items.length);
	});

	it("rejouer le seed 2× ne crée aucun doublon", () => {
		runSeed();
		runSeed();
		const count = (db.prepare("SELECT COUNT(*) AS n FROM foods").get() as { n: number }).n;
		expect(count).toBe(items.length);
		// name_normalized reste unique en base
		const distinct = (
			db.prepare("SELECT COUNT(DISTINCT name_normalized) AS n FROM foods").get() as { n: number }
		).n;
		expect(distinct).toBe(items.length);
	});

	it("un aliment custom de même nom n'est pas écrasé par le seed", () => {
		const sample = items[0];
		db.prepare(
			"INSERT INTO foods (id, name_normalized, display_fr, triggers, is_custom) VALUES (?, ?, ?, ?, 1)",
		).run("custom-1", sample.name_normalized, "MON ALIMENT", "{}");
		runSeed();
		const row = db
			.prepare("SELECT display_fr, is_custom FROM foods WHERE name_normalized = ?")
			.get(sample.name_normalized) as { display_fr: string; is_custom: number };
		expect(row.display_fr).toBe("MON ALIMENT");
		expect(row.is_custom).toBe(1);
	});
});
