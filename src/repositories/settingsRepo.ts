/**
 * Repository clé/valeur des réglages (§9, §5.11).
 * Stocke préférences UI, réponses onboarding, override de langue/thème.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";

/** Lit une valeur typée (ou `null`). */
export async function get<T = unknown>(key: string): Promise<T | null> {
	const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
	return rows.length > 0 ? (rows[0].value as T) : null;
}

/** Écrit (upsert) une valeur. */
export async function set(key: string, value: unknown): Promise<void> {
	await db
		.insert(settings)
		.values({ key, value })
		.onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Supprime une clé. */
export async function remove(key: string): Promise<void> {
	await db.delete(settings).where(eq(settings.key, key));
}

/** Toutes les paires (pour l'export). */
export async function all(): Promise<Record<string, unknown>> {
	const rows = await db.select().from(settings);
	const out: Record<string, unknown> = {};
	for (const row of rows) {
		out[row.key] = row.value;
	}
	return out;
}
