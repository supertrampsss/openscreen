/**
 * Demande d'avis stores (§7) — au 1er export médecin réussi seulement, puis
 * plus JAMAIS si l'utilisateur a refusé deux fois ou a déjà donné son avis.
 *
 * Aucune bibliothèque de review native (pas de dépendance) : on ouvre la fiche
 * store via Linking. L'état vit dans `settings` (kv, sur l'appareil).
 */

import * as settingsRepo from "@/repositories/settingsRepo";

const KEY_FIRST_EXPORT = "first_export_done";
const KEY_REVIEW_DONE = "review_done";
const KEY_DECLINED = "review_declined_count";

/** Nombre de refus au-delà duquel on ne redemande plus jamais (§7). */
export const MAX_DECLINES = 2;

/**
 * Marque un export réussi. Renvoie `firstExport` = true UNIQUEMENT au tout
 * premier (déclenche le jalon confetti §3 + la 1re demande d'avis).
 */
export async function markExportDone(): Promise<{ firstExport: boolean }> {
	const already = await settingsRepo.get<boolean>(KEY_FIRST_EXPORT);
	if (already) return { firstExport: false };
	await settingsRepo.set(KEY_FIRST_EXPORT, true);
	return { firstExport: true };
}

/** L'utilisateur a-t-il déjà exporté au moins une fois ? */
export async function hasExportedBefore(): Promise<boolean> {
	return Boolean(await settingsRepo.get<boolean>(KEY_FIRST_EXPORT));
}

/** Doit-on proposer de laisser un avis (jamais si déjà donné ou 2 refus) ? */
export async function shouldPromptReview(): Promise<boolean> {
	const done = await settingsRepo.get<boolean>(KEY_REVIEW_DONE);
	if (done) return false;
	const declined = (await settingsRepo.get<number>(KEY_DECLINED)) ?? 0;
	return declined < MAX_DECLINES;
}

/** L'utilisateur reporte : incrémente le compteur de refus. */
export async function recordReviewDeclined(): Promise<void> {
	const declined = (await settingsRepo.get<number>(KEY_DECLINED)) ?? 0;
	await settingsRepo.set(KEY_DECLINED, declined + 1);
}

/** L'utilisateur donne son avis : on ne redemandera plus jamais. */
export async function recordReviewRated(): Promise<void> {
	await settingsRepo.set(KEY_REVIEW_DONE, true);
}
