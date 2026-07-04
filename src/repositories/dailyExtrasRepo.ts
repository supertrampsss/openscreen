/**
 * Repository daily_extras (§9) — agrégat par jour : complications HBI, poids.
 * Alimenté par le sheet Symptômes (manifestations extra-intestinales).
 */

import { eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { type DailyExtra, dailyExtras } from "@/db/schema";

/** daily_extras depuis un local_date inclus (complications pour la courbe HBI/SCCAI). */
export function listSince(localDate: string): Promise<DailyExtra[]> {
	return db.select().from(dailyExtras).where(gte(dailyExtras.localDate, localDate));
}

export function getDay(localDate: string): Promise<DailyExtra | undefined> {
	return db
		.select()
		.from(dailyExtras)
		.where(eq(dailyExtras.localDate, localDate))
		.limit(1)
		.then((rows) => rows[0]);
}

/** Upsert des complications du jour (union avec l'existant possible côté appelant). */
export async function setComplications(localDate: string, complications: string[]): Promise<void> {
	const now = Date.now();
	await db
		.insert(dailyExtras)
		.values({ localDate, complications, updatedAt: now })
		.onConflictDoUpdate({
			target: dailyExtras.localDate,
			set: { complications, updatedAt: now },
		});
}
