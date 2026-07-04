/**
 * Schéma SQLite (drizzle-orm) — Crohnicle (§9).
 *
 * Toutes les tables du produit, y compris celles réservées V2 (traitements),
 * créées vides avec des colonnes minimales pour éviter une migration lourde plus tard.
 *
 * Conventions :
 * - id des entrées = uuid v7 en TEXT (triable chronologiquement).
 * - Horodatage : `occurred_at` epoch ms + `tz` IANA + `local_date` FIGÉE à la saisie
 *   (les voyages ne réordonnent jamais l'historique — §9 Dates).
 * - JSON via text({ mode: "json" }).
 * - Soft delete via `deleted_at` (§2 loi 2).
 */

import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Colonnes d'horodatage communes (epoch ms). */
const timestamps = {
	createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
	updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
};

// ---------------------------------------------------------------------------
// profile — une seule ligne (id = 1).
// ---------------------------------------------------------------------------
export const profile = sqliteTable("profile", {
	id: integer("id").primaryKey(),
	diagnosis: text("diagnosis", {
		enum: ["crohn", "uc", "ibd_u", "undiagnosed"],
	}),
	diagnosisYear: integer("diagnosis_year"),
	baselineStools: text("baseline_stools", {
		enum: ["0-2", "3-5", "6-9", "10+"],
	}),
	flareStatus: text("flare_status", {
		enum: ["flare", "remission", "unknown"],
	}).default("unknown"),
	goals: text("goals", { mode: "json" }).$type<string[]>(),
	obstacles: text("obstacles", { mode: "json" }).$type<string[]>(),
	createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ---------------------------------------------------------------------------
// symptom_entries — selles ET symptômes (kind).
// ---------------------------------------------------------------------------
export const symptomEntries = sqliteTable(
	"symptom_entries",
	{
		id: text("id").primaryKey(),
		occurredAt: integer("occurred_at").notNull(),
		tz: text("tz").notNull(),
		localDate: text("local_date").notNull(),
		kind: text("kind", { enum: ["stool", "symptom"] }).notNull(),
		bristol: integer("bristol"),
		/** Urgence 0-3. */
		urgency: integer("urgency"),
		/** Sang 0-2 (non / traces / visible). */
		blood: integer("blood"),
		/** Douleur 0-3. */
		pain: integer("pain"),
		painZone: text("pain_zone"),
		/** Fatigue 0-3. */
		fatigue: integer("fatigue"),
		/** Forme générale 0-4 (libellés HBI). */
		wellbeing: integer("wellbeing"),
		extraIntestinal: text("extra_intestinal", { mode: "json" }).$type<string[]>(),
		notes: text("notes"),
		isDraft: integer("is_draft").notNull().default(1),
		...timestamps,
		deletedAt: integer("deleted_at"),
	},
	(t) => [index("idx_symptom_entries_local_date").on(t.localDate)],
);

// ---------------------------------------------------------------------------
// meals — repas (manuel / photo / voix).
// ---------------------------------------------------------------------------
export const meals = sqliteTable(
	"meals",
	{
		id: text("id").primaryKey(),
		occurredAt: integer("occurred_at").notNull(),
		tz: text("tz").notNull(),
		localDate: text("local_date").notNull(),
		name: text("name"),
		source: text("source", { enum: ["manual", "photo", "voice"] })
			.notNull()
			.default("manual"),
		photoUri: text("photo_uri"),
		aiConfidence: text("ai_confidence", { enum: ["high", "medium", "low"] }),
		aiRaw: text("ai_raw", { mode: "json" }).$type<unknown>(),
		isDraft: integer("is_draft").notNull().default(1),
		...timestamps,
		deletedAt: integer("deleted_at"),
	},
	(t) => [index("idx_meals_local_date").on(t.localDate)],
);

// ---------------------------------------------------------------------------
// foods — dictionnaire d'aliments (seed FR + customs).
// ---------------------------------------------------------------------------
export const foods = sqliteTable("foods", {
	id: text("id").primaryKey(),
	nameNormalized: text("name_normalized").notNull().unique(),
	displayFr: text("display_fr").notNull(),
	triggers: text("triggers", { mode: "json" }).$type<Record<string, unknown>>(),
	isCustom: integer("is_custom").notNull().default(0),
});

// ---------------------------------------------------------------------------
// meal_items — lien repas ↔ aliment avec portion.
// ---------------------------------------------------------------------------
export const mealItems = sqliteTable("meal_items", {
	id: text("id").primaryKey(),
	mealId: text("meal_id")
		.notNull()
		.references(() => meals.id),
	foodId: text("food_id")
		.notNull()
		.references(() => foods.id),
	portion: text("portion", { enum: ["small", "medium", "large"] })
		.notNull()
		.default("medium"),
});

// ---------------------------------------------------------------------------
// treatments / treatment_events — V2 (colonnes minimales, tables vides).
// ---------------------------------------------------------------------------
/** Familles de traitement (§5.9). */
export const TREATMENT_KINDS = [
	"biologic_injection",
	"infusion",
	"immunosuppressant",
	"corticosteroid",
	"five_asa",
	"other",
] as const;
export type TreatmentKind = (typeof TREATMENT_KINDS)[number];

export const treatments = sqliteTable("treatments", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	kind: text("kind", { enum: TREATMENT_KINDS }),
	/** Cadence en semaines (1-8) pour les rappels à cycle long ; null = ponctuel. */
	cadenceWeeks: integer("cadence_weeks"),
	/** Prochaine échéance (local_date figée) — recalculée à chaque prise. */
	nextDue: text("next_due"),
	isActive: integer("is_active").notNull().default(1),
	...timestamps,
	deletedAt: integer("deleted_at"),
});

export const treatmentEvents = sqliteTable("treatment_events", {
	id: text("id").primaryKey(),
	treatmentId: text("treatment_id")
		.notNull()
		.references(() => treatments.id),
	occurredAt: integer("occurred_at").notNull(),
	tz: text("tz"),
	localDate: text("local_date").notNull(),
	kind: text("kind", { enum: ["taken", "skipped", "side_effect"] }),
	notes: text("notes"),
	createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ---------------------------------------------------------------------------
// daily_extras — agrégat par jour (complications HBI, poids).
// ---------------------------------------------------------------------------
export const dailyExtras = sqliteTable("daily_extras", {
	localDate: text("local_date").primaryKey(),
	complications: text("complications", { mode: "json" }).$type<string[]>(),
	weightKg: real("weight_kg"),
	updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ---------------------------------------------------------------------------
// insights_cache — bilans/insights calculés (clé → payload json).
// ---------------------------------------------------------------------------
export const insightsCache = sqliteTable("insights_cache", {
	key: text("key").primaryKey(),
	payload: text("payload", { mode: "json" }).$type<unknown>(),
	computedAt: integer("computed_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ---------------------------------------------------------------------------
// settings — clé/valeur (préférences, réponses onboarding).
// ---------------------------------------------------------------------------
export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value", { mode: "json" }).$type<unknown>(),
});

// Types inférés réutilisables dans les repositories.
export type SymptomEntry = typeof symptomEntries.$inferSelect;
export type NewSymptomEntry = typeof symptomEntries.$inferInsert;
export type Meal = typeof meals.$inferSelect;
export type NewMeal = typeof meals.$inferInsert;
export type Food = typeof foods.$inferSelect;
export type MealItem = typeof mealItems.$inferSelect;
export type Profile = typeof profile.$inferSelect;
export type DailyExtra = typeof dailyExtras.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type Treatment = typeof treatments.$inferSelect;
export type NewTreatment = typeof treatments.$inferInsert;
export type TreatmentEvent = typeof treatmentEvents.$inferSelect;
export type NewTreatmentEvent = typeof treatmentEvents.$inferInsert;
