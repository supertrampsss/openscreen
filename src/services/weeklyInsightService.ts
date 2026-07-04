/**
 * Insight IA hebdo (§7) — Premium. Orchestration : agrégats ANONYMES → proxy
 * `/weekly-insight` (ou fallback démo local), avec cache par semaine + langue.
 *
 * PRIVACY (§2 loi 4) : seul l'objet `InsightAggregates` (nombres + libellés
 * génériques, construit et testé dans `domain/insightAggregates.ts`) quitte
 * l'appareil. Jamais de note libre ni de date précise.
 *
 * Génération « le dimanche ou au premier affichage de la semaine » = clé de
 * cache basée sur le lundi de la semaine courante : un nouvel affichage dans une
 * nouvelle semaine régénère, sinon on sert le cache (sauf `force`).
 */

import { nowEntryTimestamp } from "@/domain/dates";
import type { InsightAggregates } from "@/domain/insightAggregates";
import * as cache from "@/repositories/insightsCacheRepo";
import { currentEntitlementToken } from "./entitlements";
import { getDeviceId, proxyUrl } from "./mealScanService";

export interface WeeklyInsight {
	headline: string;
	insight: string;
	/** Généré localement (proxy non configuré). */
	demo: boolean;
}

/** Lundi (local_date) de la semaine d'une date — clé de cache stable/semaine. */
export function weekStartLocalDate(todayLocalDate: string): string {
	const [y, m, d] = todayLocalDate.split("-").map(Number);
	const date = new Date(Date.UTC(y, m - 1, d, 12));
	const dow = date.getUTCDay(); // 0 = dimanche
	const mondayOffset = (dow + 6) % 7; // jours écoulés depuis lundi
	date.setUTCDate(date.getUTCDate() - mondayOffset);
	return date.toISOString().slice(0, 10);
}

function cacheKey(weekStart: string, lang: string): string {
	return `weekly_insight:${weekStart}:${lang}`;
}

export interface WeeklyInsightRequest {
	aggregates: InsightAggregates;
	lang: "fr" | "en";
	/** Texte de repli localisé (mode démo, proxy absent). */
	demoFallback: { headline: string; insight: string };
	force?: boolean;
}

/**
 * Charge (cache) ou génère l'insight de la semaine.
 * Renvoie `null` si l'utilisateur n'est pas Premium, ou en cas d'échec réseau
 * (la carte reste alors muette plutôt que d'afficher une erreur anxiogène).
 */
export async function getWeeklyInsight({
	aggregates,
	lang,
	demoFallback,
	force,
}: WeeklyInsightRequest): Promise<WeeklyInsight | null> {
	const token = await currentEntitlementToken();
	if (!token) return null; // pas Premium → la carte affiche un teaser.

	const key = cacheKey(weekStartLocalDate(nowEntryTimestamp().localDate), lang);
	if (!force) {
		const cached = await cache.get<WeeklyInsight>(key);
		if (cached) return cached.payload;
	}

	const base = proxyUrl();
	if (!base) {
		const result: WeeklyInsight = { ...demoFallback, demo: true };
		await cache.set(key, result);
		return result;
	}

	try {
		const deviceId = await getDeviceId();
		const resp = await fetch(`${base.replace(/\/$/, "")}/weekly-insight`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ aggregates, lang, deviceId, entitlementToken: token }),
		});
		if (!resp.ok) return null;
		const body = (await resp.json().catch(() => null)) as {
			result?: { headline?: string; insight?: string };
		} | null;
		if (!body?.result?.insight) return null;
		const result: WeeklyInsight = {
			headline: body.result.headline ?? demoFallback.headline,
			insight: body.result.insight,
			demo: false,
		};
		await cache.set(key, result);
		return result;
	} catch {
		return null;
	}
}
