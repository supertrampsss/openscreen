/**
 * Rapport médecin — construction de la structure de données (§5.8) — module PUR.
 *
 * Transforme des données brutes (entrées, extras, profil) en une structure prête
 * à rendre (natif ou HTML). Aucune I/O, aucune dépendance RN/expo, aucun
 * `Date.now()` : l'appelant injecte `fromDate`/`toDate` → déterminisme total.
 *
 * Sections (§5.8) : période · profil (identité optionnelle SEULEMENT si fournie)
 * · courbe HBI/SCCAI (réutilise `scoreSeries`) · tableaux hebdo (semaine ISO) ·
 * observance (V2 : omise si aucun traitement) · top associations (V2 : « après
 * 14 jours » tant que Phase 4 absente) · points à consulter (règles locales).
 */

import { type ConsultPoint, consultPoints, type DatedScore } from "./consultPoints";
import { isNightStool } from "./sccai";
import {
	dailyScoreSeries,
	groupEntriesByDate,
	type ScoreDayEntry,
	type ScoreKind,
	scoreKindForDiagnosis,
} from "./scoreSeries";
import { datesInclusive, isoWeekKey } from "./streak";
import { aggregateAdherence } from "./treatments";

/** Entrée brute (sur-ensemble couvrant HBI, SCCAI, fatigue et sang). */
export interface ReportEntry {
	localDate: string;
	occurredAt: number;
	tz: string;
	kind: "stool" | "symptom";
	bristol?: number | null;
	pain?: number | null;
	fatigue?: number | null;
	wellbeing?: number | null;
	blood?: number | null;
	urgency?: number | null;
	extraIntestinal?: string[] | null;
}

/** Extras d'un jour utiles au rapport. */
export interface ReportDayExtra {
	complications?: string[] | null;
	weightKg?: number | null;
}

export type ReportPeriodDays = 30 | 90 | 180;

export interface ReportInput {
	periodDays: ReportPeriodDays;
	/** Première date locale incluse ('YYYY-MM-DD'). */
	fromDate: string;
	/** Dernière date locale incluse (aujourd'hui). */
	toDate: string;
	profile: {
		diagnosis?: string | null;
		diagnosisYear?: number | null;
	};
	/** Identité affichée sur le PDF — omise si absente/vide. */
	identity?: string | null;
	/** Entrées commitées de la période (ordre indifférent). */
	entries: ReportEntry[];
	/** Extras par local_date (complications, poids). */
	extrasByDate: Map<string, ReportDayExtra>;
	/**
	 * Traitements actifs (§5.9) avec leurs prises sur la période — l'observance
	 * n'est calculée que pour ceux qui ont une cadence ; section omise si aucun.
	 */
	treatments?: TreatmentAdherenceInput[];
	/** Corrélations disponibles (Phase 4) ? Sinon compte à rebours. */
	correlationsReady?: boolean;
	/** Jours restants avant les premières associations (si pas prêtes). */
	correlationsCountdown?: number;
	/** Top associations observées (§5.7) — vide tant qu'aucune n'est éligible. */
	topAssociations?: ReportAssociation[];
}

/** Un traitement + son nombre de prises sur la période (pour l'observance). */
export interface TreatmentAdherenceInput {
	cadenceWeeks: number | null;
	takenCount: number;
}

/** Une association observée reportée dans le PDF (déjà prête à l'affichage). */
export interface ReportAssociation {
	/** Libellé affichable (nom d'aliment ou attribut déjà traduit). */
	displayName: string;
	/** Signal concerné (clé : pain/bristol/blood/urgency). */
	signal: string;
	/** Nb d'expositions suivies du signal. */
	n: number;
}

/** Une ligne du tableau hebdomadaire. */
export interface WeeklyRow {
	/** Clé de semaine ISO ('YYYY-Www'). */
	weekKey: string;
	/** Numéro de semaine ISO (1-53), pour l'affichage. */
	weekNumber: number;
	/** Nb total de selles de la semaine. */
	stools: number;
	/**
	 * Nb de jours avec du sang, seuil bas blood ≥ 1 (TRACES INCLUSES) — colonne
	 * hebdo descriptive, libellée « Jours avec sang (traces incluses) ». À NE PAS
	 * confondre avec `consultPoints.visibleBlood` qui exige blood ≥ 2 (sang
	 * VISIBLE) : les deux seuils sont voulus (§5.8) — panorama large ici, signal
	 * clinique à remonter au gastro là-bas.
	 */
	bloodDays: number;
	/** Pire douleur de la semaine (`null` si jamais renseignée). */
	worstPain: number | null;
	/** Dernier poids noté de la semaine (`null` si aucun). */
	weightKg: number | null;
	/** Jours documentés dans la semaine. */
	documentedDays: number;
}

export interface ReportData {
	period: { days: ReportPeriodDays; from: string; to: string };
	profile: { diagnosis: string | null; diagnosisYear: number | null; identity: string | null };
	scoreKind: ScoreKind;
	/** Dates de la courbe (chronologiques, une par jour de la période). */
	scoreDates: string[];
	/** Valeurs de score alignées sur `scoreDates` (`null` = jour sans donnée). */
	scoreSeries: (number | null)[];
	weekly: WeeklyRow[];
	/** Observance traitement (§5.9) — `null` si aucun traitement à cadence. */
	observance: { taken: number; expected: number } | null;
	/** Top associations observées (§5.7) : `items` peuplé dès qu'éligibles. */
	associations: { ready: boolean; countdown: number; items: ReportAssociation[] };
	consultPoints: ConsultPoint[];
	/** Jours documentés sur toute la période. */
	documentedDays: number;
}

/** Pire (max) valeur non nulle d'un champ sur un jeu d'entrées, sinon `null`. */
function worstOf(entries: ReportEntry[], field: "pain" | "fatigue" | "blood"): number | null {
	const vals = entries.map((e) => e[field]).filter((v): v is number => v != null);
	return vals.length ? Math.max(...vals) : null;
}

/** Construit le rapport complet (déterministe). */
export function buildReport(input: ReportInput): ReportData {
	const dates = datesInclusive(input.fromDate, input.toDate);
	const entriesByDate = groupEntriesByDate(input.entries);

	const scoreKind = scoreKindForDiagnosis(input.profile.diagnosis);
	const scoreSeries = dailyScoreSeries(
		dates,
		entriesByDate as unknown as Map<string, ScoreDayEntry[]>,
		input.extrasByDate,
		scoreKind,
	);

	// --- Tableaux hebdomadaires (par semaine ISO) ---
	const weekly = buildWeekly(dates, entriesByDate, input.extrasByDate);

	// --- Signaux pour les points à consulter ---
	let visibleBloodDays = 0;
	let highFatigueDays = 0;
	let nocturnalStools = 0;
	let documentedDays = 0;
	const scoreByDate: DatedScore[] = [];

	dates.forEach((d, i) => {
		const es = entriesByDate.get(d);
		if (es && es.length > 0) {
			documentedDays++;
			if ((worstOf(es, "blood") ?? 0) >= 2) visibleBloodDays++;
			if ((worstOf(es, "fatigue") ?? 0) >= 2) highFatigueDays++;
			for (const e of es) {
				if (e.kind === "stool" && isNightStool(e.occurredAt, e.tz)) nocturnalStools++;
			}
		}
		const s = scoreSeries[i];
		if (s != null) scoreByDate.push({ date: d, score: s });
	});

	const points = consultPoints({
		documentedDays,
		visibleBloodDays,
		highFatigueDays,
		nocturnalStools,
		scoreByDate,
	});

	const identity = input.identity?.trim() ? input.identity.trim() : null;
	// Observance (§5.9) : agrégée sur les traitements à cadence ; `null` sinon.
	const observance = aggregateAdherence(input.treatments ?? [], input.periodDays);

	return {
		period: { days: input.periodDays, from: input.fromDate, to: input.toDate },
		profile: {
			diagnosis: input.profile.diagnosis ?? null,
			diagnosisYear: input.profile.diagnosisYear ?? null,
			identity,
		},
		scoreKind,
		scoreDates: dates,
		scoreSeries,
		weekly,
		observance,
		associations: {
			ready: (input.topAssociations?.length ?? 0) > 0 || Boolean(input.correlationsReady),
			countdown: input.correlationsCountdown ?? 0,
			items: input.topAssociations ?? [],
		},
		consultPoints: points,
		documentedDays,
	};
}

/** Agrège les jours en lignes hebdomadaires ISO (ordre chronologique). */
function buildWeekly(
	dates: string[],
	entriesByDate: Map<string, ReportEntry[]>,
	extrasByDate: Map<string, ReportDayExtra>,
): WeeklyRow[] {
	const order: string[] = [];
	const rows = new Map<string, WeeklyRow>();

	for (const d of dates) {
		const key = isoWeekKey(d);
		let row = rows.get(key);
		if (!row) {
			row = {
				weekKey: key,
				weekNumber: Number.parseInt(key.slice(key.indexOf("W") + 1), 10),
				stools: 0,
				bloodDays: 0,
				worstPain: null,
				weightKg: null,
				documentedDays: 0,
			};
			rows.set(key, row);
			order.push(key);
		}

		const es = entriesByDate.get(d);
		if (es && es.length > 0) {
			row.documentedDays++;
			row.stools += es.filter((e) => e.kind === "stool").length;
			// Seuil bas volontaire (blood ≥ 1, traces incluses) — cf. doc de `bloodDays`.
			if ((worstOf(es, "blood") ?? 0) > 0) row.bloodDays++;
			const pain = worstOf(es, "pain");
			if (pain != null)
				row.worstPain = row.worstPain == null ? pain : Math.max(row.worstPain, pain);
		}
		const extra = extrasByDate.get(d);
		// Dernier poids noté de la semaine (les dates sont chronologiques).
		if (extra?.weightKg != null) row.weightKg = extra.weightKg;
	}

	// Ne conserver que les semaines qui contiennent au moins un jour documenté.
	return order.map((k) => rows.get(k)!).filter((r) => r.documentedDays > 0);
}
