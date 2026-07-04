/**
 * Streak « jours documentés » — module PUR (zéro import RN), testable sous Node.
 *
 * Mécanique de rétention désarmée de sa toxicité (§7, §2 loi 3) :
 *  - Un JOUR DOCUMENTÉ (≥1 entrée commitée ce local_date) prolonge la série.
 *  - GEL AUTOMATIQUE en mode poussée : un jour « gelé » (flare) ne casse JAMAIS
 *    la série — documenté il la prolonge (+1), non documenté il la protège (pont,
 *    sans l'incrémenter). « Votre série est protégée pendant votre poussée. »
 *  - 1 JOUR DE GRÂCE par semaine calendaire (ISO) : un unique trou d'un jour hors
 *    poussée est pardonné si la grâce de sa semaine est encore disponible.
 *
 * Jamais de reset punitif : le « jour en cours » non documenté n'est pas un trou
 * (journée pas finie) — il n'incrémente ni ne casse la série.
 *
 * NOTE de bord assumée : la grâce étant « 1 par semaine calendaire », un trou de
 * 2 jours à cheval sur deux semaines ISO peut être ponté (une grâce par semaine).
 * C'est la lecture littérale de la règle ; un trou de 2 jours dans UNE semaine casse.
 *
 * SÉMANTIQUE DE LA GRÂCE (correctif) : la grâce se consomme AU SEIN d'une série —
 * une série déjà cassée ne « gaspille » pas la grâce d'une semaine pour les séries
 * suivantes. `longest` est donc le maximum, sur toutes les fins de série possibles,
 * du même balayage arrière que `current` ; l'invariant current ≤ longest est
 * structurel. (L'ancien balayage avant allouait la grâce gloutonnement à travers
 * les séries mortes et pouvait sous-estimer `longest`.)
 */

/** Découpe 'YYYY-MM-DD' → parties numériques. */
function parts(d: string): [number, number, number] {
	const [y, m, day] = d.split("-").map(Number);
	return [y, m, day];
}

/** 'YYYY-MM-DD' → epoch ms à midi UTC (évite tout basculement de fuseau). */
function toMs(d: string): number {
	const [y, m, day] = parts(d);
	return Date.UTC(y, m - 1, day, 12);
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** epoch ms → 'YYYY-MM-DD' (UTC). */
function toYmd(ms: number): string {
	const dt = new Date(ms);
	return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Décale une date locale de N jours (N peut être négatif). */
export function addDays(d: string, n: number): string {
	return toYmd(toMs(d) + n * 86_400_000);
}

/** Liste des local_dates de `start` à `end` inclus (ordre chronologique). */
export function datesInclusive(start: string, end: string): string[] {
	const out: string[] = [];
	for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
	return out;
}

/**
 * Clé de semaine calendaire ISO 8601 ('YYYY-Www', lundi = premier jour).
 * Deux dates de la même semaine ISO partagent la même clé.
 */
export function isoWeekKey(d: string): string {
	const [y, m, day] = parts(d);
	const date = new Date(Date.UTC(y, m - 1, day));
	// Jour ISO : lundi = 0 … dimanche = 6. On se place sur le jeudi de la semaine.
	const isoDow = (date.getUTCDay() + 6) % 7;
	date.setUTCDate(date.getUTCDate() - isoDow + 3);
	const isoYear = date.getUTCFullYear();
	const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
	const firstIsoDow = (firstThursday.getUTCDay() + 6) % 7;
	firstThursday.setUTCDate(firstThursday.getUTCDate() - firstIsoDow + 3);
	const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
	return `${isoYear}-W${pad2(week)}`;
}

export interface StreakInput {
	/** Date locale de référence (aujourd'hui). */
	today: string;
	/** Jours documentés (≥1 entrée commitée), local_date 'YYYY-MM-DD'. */
	documentedDates: Iterable<string>;
	/** Jours en mode poussée (gelés). */
	frozenDates?: Iterable<string>;
}

export interface StreakResult {
	/** Série en cours (jours documentés consécutifs, gel/grâce inclus). ≥ 0. */
	current: number;
	/** Plus longue série jamais atteinte. ≥ current. */
	longest: number;
	/** Aujourd'hui est-il en mode poussée (série protégée) ? */
	frozen: boolean;
	/** La grâce de la semaine calendaire courante a-t-elle été consommée ? */
	graceUsedThisWeek: boolean;
}

/**
 * Balayage ARRIÈRE depuis `anchor` : longueur de la série se terminant à `anchor`,
 * avec pont gel (poussée) et 1 grâce par semaine ISO consommée AU SEIN de la série.
 * `skipToday` : la journée en cours non documentée n'est ni un trou ni un incrément.
 */
function backwardRunFrom(
	anchor: string,
	start: string,
	today: string,
	documented: ReadonlySet<string>,
	frozen: ReadonlySet<string>,
): { count: number; graceWeeks: Set<string> } {
	let count = 0;
	const graceWeeks = new Set<string>();
	for (let d = anchor; d >= start; d = addDays(d, -1)) {
		if (documented.has(d)) {
			count++;
			continue;
		}
		if (frozen.has(d)) continue; // gel : pont, ne casse jamais
		if (d === today) continue; // journée en cours : ni trou ni incrément
		const wk = isoWeekKey(d);
		if (!graceWeeks.has(wk)) {
			graceWeeks.add(wk); // grâce de la semaine : pardonne ce trou
			continue;
		}
		break; // trou non pardonné : la série s'arrête ici
	}
	return { count, graceWeeks };
}

/**
 * Calcule la série documentée. `current` = série ancrée sur aujourd'hui ;
 * `longest` = maximum du même balayage arrière sur chaque fin de série candidate
 * (chaque jour documenté), garanti ≥ current par construction.
 */
export function computeStreak(input: StreakInput): StreakResult {
	const { today } = input;
	const documented = new Set(input.documentedDates);
	const frozen = new Set(input.frozenDates ?? []);

	// Début du balayage = plus ancienne date connue (bornée à ≤ aujourd'hui).
	let start = today;
	for (const d of [...documented, ...frozen]) {
		if (d < start) start = d;
	}

	// --- current : série ancrée sur aujourd'hui ---
	const cur = backwardRunFrom(today, start, today, documented, frozen);
	const current = cur.count;

	// --- longest : max sur toutes les fins de série candidates ---
	// Une série maximale se termine forcément sur un jour documenté (un suffixe
	// gelé/graced n'ajoute rien au compte) : il suffit d'évaluer ces ancres.
	// O(D × L) — D jours documentés bornés (≤ ~1 an utile ici), calculé rarement.
	let longest = current;
	for (const e of documented) {
		if (e > today) continue;
		// Ancre dominée : si le lendemain est documenté, la série finissant à e+1
		// contient celle finissant à e — inutile de l'évaluer.
		if (documented.has(addDays(e, 1))) continue;
		const { count } = backwardRunFrom(e, start, today, documented, frozen);
		if (count > longest) longest = count;
	}

	return {
		current,
		longest,
		frozen: frozen.has(today),
		graceUsedThisWeek: current > 0 && cur.graceWeeks.has(isoWeekKey(today)),
	};
}
