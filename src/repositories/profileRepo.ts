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

/** Champs du profil renseignables à l'onboarding (§4). */
export type ProfilePatch = Partial<
	Pick<
		Profile,
		"diagnosis" | "diagnosisYear" | "baselineStools" | "flareStatus" | "goals" | "obstacles"
	>
>;

/**
 * Upsert du profil (ligne unique id=1). Fusionne le patch : ré-exécuter
 * l'onboarding met à jour sans jamais effacer les données de suivi (§ Réglages).
 */
export async function upsertProfile(patch: ProfilePatch): Promise<void> {
	await db
		.insert(profile)
		.values({ id: 1, ...patch })
		.onConflictDoUpdate({ target: profile.id, set: patch });
}
