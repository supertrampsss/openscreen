import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { buildBackup } from "@/domain/backup";
import { type RestoreDriver, restoreAllTables } from "./transactions";

/**
 * Test de régression du bug PR 1 (§2 loi 2) : une restauration de backup
 * partielle/corrompue NE DOIT PAS laisser la base à moitié écrite.
 *
 * On rejoue le vrai schéma (migrations drizzle) sur better-sqlite3 — même moteur
 * SQLite que expo-sqlite — et on branche `restoreAllTables` (la logique partagée
 * avec `backupService`) sur un pilote better-sqlite3 SYNChrone. Le bug d'origine
 * (`db.transaction(async …)` qui committe avant l'exécution) aurait produit une
 * base à moitié écrite ; ce test verrouille le comportement tout-ou-rien.
 */

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

/** Pilote de restauration adossé à better-sqlite3 (colonnes snake_case brutes). */
function makeDriver(db: Database.Database): RestoreDriver {
	return {
		begin: () => db.exec("BEGIN"),
		commit: () => db.exec("COMMIT"),
		rollback: () => db.exec("ROLLBACK"),
		deleteAll: (table) => {
			db.prepare(`DELETE FROM ${table}`).run();
		},
		insertRows: (table, rows) => {
			for (const row of rows as Record<string, unknown>[]) {
				const cols = Object.keys(row);
				const placeholders = cols.map(() => "?").join(", ");
				const stmt = db.prepare(
					`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
				);
				stmt.run(...cols.map((c) => row[c]));
			}
		},
	};
}

const symptomRow = (id: string, bristol: number) => ({
	id,
	occurred_at: 1_700_000_000_000,
	tz: "Europe/Paris",
	local_date: "2024-01-01",
	kind: "stool",
	bristol,
	is_draft: 0,
	created_at: 1,
	updated_at: 1,
});

const mealRow = (id: string) => ({
	id,
	occurred_at: 1_700_000_000_000,
	tz: "Europe/Paris",
	local_date: "2024-01-01",
	name: "Repas",
	source: "manual",
	is_draft: 0,
	created_at: 1,
	updated_at: 1,
});

describe("restoreAllTables (rollback tout-ou-rien)", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(":memory:");
		db.pragma("foreign_keys = ON");
		applyMigrations(db);
		// Donnée existante « précieuse » qu'un import raté ne doit pas détruire.
		makeDriver(db).insertRows("symptom_entries", [symptomRow("existing", 4)]);
	});

	function countAll() {
		const n = (t: string) =>
			(db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
		return {
			symptoms: n("symptom_entries"),
			meals: n("meals"),
			mealItems: n("meal_items"),
		};
	}

	it("un backup corrompu (FK invalide) laisse la base INCHANGÉE (rollback)", () => {
		// meal_items référence un meal fantôme → violation de FK À L'INSERTION,
		// APRÈS que symptom_entries et meals aient déjà été purgés puis réinsérés.
		const corrupt = buildBackup({
			profile: [],
			foods: [],
			symptom_entries: [symptomRow("from-backup", 6)],
			meals: [mealRow("m1")],
			meal_items: [{ id: "mi1", meal_id: "ghost-meal", food_id: "ghost-food", portion: "medium" }],
			treatments: [],
			treatment_events: [],
			daily_extras: [],
			insights_cache: [],
			settings: [],
		});

		expect(() => restoreAllTables(makeDriver(db), corrupt)).toThrow();

		// La base doit être EXACTEMENT dans son état d'avant : la ligne existante
		// est toujours là, aucune ligne du backup n'a survécu, pas de moitié écrite.
		expect(countAll()).toEqual({ symptoms: 1, meals: 0, mealItems: 0 });
		const survivor = db.prepare("SELECT id, bristol FROM symptom_entries").get();
		expect(survivor).toEqual({ id: "existing", bristol: 4 });
	});

	it("un backup valide remplace les données de façon atomique (commit)", () => {
		const valid = buildBackup({
			profile: [],
			foods: [],
			symptom_entries: [symptomRow("from-backup", 6)],
			meals: [mealRow("m1")],
			meal_items: [],
			treatments: [],
			treatment_events: [],
			daily_extras: [],
			insights_cache: [],
			settings: [],
		});

		const rowCount = restoreAllTables(makeDriver(db), valid);

		expect(rowCount).toBe(2);
		expect(countAll()).toEqual({ symptoms: 1, meals: 1, mealItems: 0 });
		const row = db.prepare("SELECT id, bristol FROM symptom_entries").get();
		expect(row).toEqual({ id: "from-backup", bristol: 6 });
	});
});
