import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Tests de migrations (§9) : on rejoue chaque fichier `drizzle/*.sql` sur une
 * base better-sqlite3 EN MÉMOIRE (même moteur que expo-sqlite), en découpant sur
 * `--> statement-breakpoint`. Garantit que les migrations commitées produisent le
 * schéma attendu — condition du « zéro perte de données ».
 */

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

function migrationFiles(): string[] {
	return readdirSync(drizzleDir)
		.filter((f) => f.endsWith(".sql"))
		.sort();
}

function applyMigrations(db: Database.Database): void {
	for (const file of migrationFiles()) {
		const sql = readFileSync(join(drizzleDir, file), "utf8");
		for (const stmt of sql.split("--> statement-breakpoint")) {
			const trimmed = stmt.trim();
			if (trimmed) db.exec(trimmed);
		}
	}
}

const EXPECTED_TABLES = [
	"daily_extras",
	"foods",
	"insights_cache",
	"meal_items",
	"meals",
	"profile",
	"settings",
	"symptom_entries",
	"treatment_events",
	"treatments",
];

describe("migrations drizzle", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(":memory:");
		db.pragma("foreign_keys = ON");
		applyMigrations(db);
	});

	it("crée les 10 tables du schéma", () => {
		const rows = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
			.all() as { name: string }[];
		const names = rows.map((r) => r.name).sort();
		expect(names).toEqual(EXPECTED_TABLES);
	});

	it("symptom_entries possède les colonnes clés", () => {
		const cols = (db.prepare("PRAGMA table_info(symptom_entries)").all() as { name: string }[]).map(
			(c) => c.name,
		);
		for (const col of [
			"id",
			"occurred_at",
			"tz",
			"local_date",
			"kind",
			"bristol",
			"urgency",
			"blood",
			"pain",
			"wellbeing",
			"is_draft",
			"deleted_at",
		]) {
			expect(cols).toContain(col);
		}
	});

	it("les colonnes traitements de la migration 0001 existent", () => {
		const trCols = (db.prepare("PRAGMA table_info(treatments)").all() as { name: string }[]).map(
			(c) => c.name,
		);
		expect(trCols).toContain("next_due");
		expect(trCols).toContain("cadence_weeks");
		const evCols = (
			db.prepare("PRAGMA table_info(treatment_events)").all() as { name: string }[]
		).map((c) => c.name);
		expect(evCols).toContain("tz");
		expect(evCols).toContain("local_date");
	});

	it("les index local_date existent", () => {
		const idx = (
			db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[]
		).map((r) => r.name);
		expect(idx).toContain("idx_symptom_entries_local_date");
		expect(idx).toContain("idx_meals_local_date");
	});

	it("INSERT + upsert de brouillon (ON CONFLICT) fonctionne", () => {
		const insert = db.prepare(
			`INSERT INTO symptom_entries (id, occurred_at, tz, local_date, kind, bristol, is_draft)
			 VALUES (@id, @occurred_at, @tz, @local_date, @kind, @bristol, 1)
			 ON CONFLICT(id) DO UPDATE SET bristol = excluded.bristol, is_draft = excluded.is_draft`,
		);
		const row = {
			id: "e1",
			occurred_at: 1_700_000_000_000,
			tz: "Europe/Paris",
			local_date: "2024-01-01",
			kind: "stool",
			bristol: 4,
		};
		insert.run(row);
		insert.run({ ...row, bristol: 6 });
		const saved = db
			.prepare("SELECT bristol, is_draft FROM symptom_entries WHERE id = ?")
			.get("e1");
		expect(saved).toEqual({ bristol: 6, is_draft: 1 });
	});

	it("la FK meal_items → meals est appliquée", () => {
		const insertItem = db.prepare(
			"INSERT INTO meal_items (id, meal_id, food_id, portion) VALUES (?, ?, ?, 'medium')",
		);
		// meal_id / food_id inexistants → violation de clé étrangère.
		expect(() => insertItem.run("mi1", "ghost-meal", "ghost-food")).toThrow(/FOREIGN KEY/i);
	});
});
