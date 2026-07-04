/**
 * Repository du cache d'insights (§7, table `insights_cache`).
 *
 * Stocke les payloads calculés/générés par clé (bilan hebdo local, insight IA
 * hebdo) pour éviter de régénérer à chaque affichage. Purement local.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { insightsCache } from "@/db/schema";

export interface CachedInsight<T = unknown> {
	payload: T;
	computedAt: number;
}

/** Lit un payload typé (ou `null`). */
export async function get<T = unknown>(key: string): Promise<CachedInsight<T> | null> {
	const rows = await db.select().from(insightsCache).where(eq(insightsCache.key, key)).limit(1);
	if (rows.length === 0) return null;
	return { payload: rows[0].payload as T, computedAt: rows[0].computedAt };
}

/** Écrit (upsert) un payload avec l'horodatage courant. */
export async function set(key: string, payload: unknown): Promise<void> {
	const computedAt = Date.now();
	await db
		.insert(insightsCache)
		.values({ key, payload, computedAt })
		.onConflictDoUpdate({ target: insightsCache.key, set: { payload, computedAt } });
}
