/**
 * Repository profil (§9) — ligne unique (id = 1), renseignée à l'onboarding
 * (Phase 6). Peut être absente avant : les appelants gèrent `undefined`.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { type Profile, profile } from "@/db/schema";

/** Lit le profil (ou `undefined` s'il n'existe pas encore). */
export function getProfile(): Promise<Profile | undefined> {
	return db
		.select()
		.from(profile)
		.where(eq(profile.id, 1))
		.limit(1)
		.then((rows) => rows[0]);
}
