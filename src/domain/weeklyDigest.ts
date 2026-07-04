/**
 * Bilan hebdomadaire local — module PUR (§5.7, §7).
 *
 * Agrège 7 jours en un résumé NEUTRE + un seul « fait notable » bienveillant
 * (§2 loi 3 : jamais anxiogène). Le domaine ne contient AUCUNE chaîne traduite :
 * il renvoie des données + une clé de fait notable que l'UI rend via i18n.
 */

/** Fait notable mis en avant (choisi par règles, toujours factuel/positif). */
export type NotableKind = "noBlood" | "fewerStools" | "fullWeek" | "documented" | "empty";

export interface WeeklyDigestInput {
	/** Selles par jour sur 7 jours ; `null` = jour non documenté (pas 0). */
	dailyStools: (number | null)[];
	/** Nombre de jours de la semaine avec du sang (>0). */
	bloodDays: number;
	/** Moyenne de selles/jour de la semaine précédente (comparaison), si connue. */
	previousAvgStools?: number | null;
}

export interface WeeklyDigest {
	/** Jours documentés dans la semaine (0-7). */
	documentedDays: number;
	/** Total de selles sur les jours documentés. */
	totalStools: number;
	/** Moyenne de selles par jour documenté (`null` si aucun jour documenté). */
	avgStools: number | null;
	/** Jours avec sang. */
	bloodDays: number;
	/** Fait notable + éventuel compte associé. */
	notable: { kind: NotableKind; count?: number };
}

/** Agrège une semaine. Le fait notable suit un ordre de priorité bienveillant. */
export function weeklyDigest(input: WeeklyDigestInput): WeeklyDigest {
	const documented = input.dailyStools.filter((v): v is number => v != null);
	const documentedDays = documented.length;
	const totalStools = documented.reduce((a, b) => a + b, 0);
	const avgStools = documentedDays > 0 ? totalStools / documentedDays : null;

	return {
		documentedDays,
		totalStools,
		avgStools,
		bloodDays: input.bloodDays,
		notable: pickNotable({
			documentedDays,
			bloodDays: input.bloodDays,
			avgStools,
			previousAvgStools: input.previousAvgStools ?? null,
		}),
	};
}

function pickNotable(ctx: {
	documentedDays: number;
	bloodDays: number;
	avgStools: number | null;
	previousAvgStools: number | null;
}): { kind: NotableKind; count?: number } {
	if (ctx.documentedDays === 0) return { kind: "empty" };
	// Priorité 1 : une semaine sans sang, quand la semaine est un peu suivie.
	if (ctx.bloodDays === 0 && ctx.documentedDays >= 3) return { kind: "noBlood" };
	// Priorité 2 : selles en baisse vs semaine précédente (factuel, encourageant).
	if (
		ctx.avgStools != null &&
		ctx.previousAvgStools != null &&
		ctx.avgStools + 0.5 <= ctx.previousAvgStools
	) {
		return { kind: "fewerStools" };
	}
	// Priorité 3 : semaine complète documentée.
	if (ctx.documentedDays >= 7) return { kind: "fullWeek" };
	// Sinon : nombre de jours documentés (transforme le suivi en progrès).
	return { kind: "documented", count: ctx.documentedDays };
}
