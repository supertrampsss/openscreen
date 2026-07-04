/**
 * Pipeline photo → analyse IA (§5.4, §6).
 *
 * URI photo → redimensionnement (long côté ≤1092, JPEG q0.8, EXIF normalisé par
 * le resize) → base64 → POST au proxy Cloudflare `${EXPO_PUBLIC_AI_PROXY_URL}
 * /analyze-meal` avec un deviceId anonyme (uuid stocké dans settings à la 1re
 * utilisation).
 *
 * MODE DÉMO : si `EXPO_PUBLIC_AI_PROXY_URL` est absent (proxy non déployé — cf.
 * §11-bis), on renvoie après 1,5 s une réponse simulée réaliste marquée
 * `demo:true`, pour que le flow reste testable de bout en bout sans backend.
 *
 * ÉCHECS JAMAIS SILENCIEUX (§5.4.5) : toute erreur remonte comme `ScanError`
 * typée (`trial_exhausted`, `refused`, `network`, `server`, `bad_image`) que
 * l'UI mappe sur un fallback explicite.
 */

import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import { newId } from "@/db/id";
import type { FoodTriggers } from "@/domain/foods";
import { coerceTriggers } from "@/domain/foods";
import * as settingsRepo from "@/repositories/settingsRepo";

const DEVICE_ID_KEY = "deviceId";
const LONG_EDGE = 1092;

export type ScanConfidence = "high" | "medium" | "low";
export type ScanPortion = "small" | "medium" | "large";

export interface ScanIngredient {
	name: string;
	portion: ScanPortion;
	triggers: FoodTriggers;
}

export interface ScanDish {
	name: string;
	confidence: ScanConfidence;
	ingredients: ScanIngredient[];
}

export interface ScanResult {
	reasoning: string;
	is_food: boolean;
	dishes: ScanDish[];
	notes: string;
}

export interface ScanResponse {
	result: ScanResult;
	/** Analyses d'essai restantes (null pour un abonné). */
	remaining: number | null;
	/** Réponse simulée locale (proxy non configuré). */
	demo: boolean;
}

export type ScanErrorKind = "trial_exhausted" | "refused" | "network" | "server" | "bad_image";

export class ScanError extends Error {
	readonly kind: ScanErrorKind;
	readonly remaining: number | null;
	constructor(kind: ScanErrorKind, remaining: number | null = null) {
		super(kind);
		this.name = "ScanError";
		this.kind = kind;
		this.remaining = remaining;
	}
}

/** URL du proxy IA (env Expo). Absent → mode démo. */
export function proxyUrl(): string | undefined {
	const url = process.env.EXPO_PUBLIC_AI_PROXY_URL;
	return url && url.length > 0 ? url : undefined;
}

/** deviceId anonyme, persistant (settings). Créé à la 1re utilisation. */
export async function getDeviceId(): Promise<string> {
	const existing = await settingsRepo.get<string>(DEVICE_ID_KEY);
	if (existing) return existing;
	const id = newId();
	await settingsRepo.set(DEVICE_ID_KEY, id);
	return id;
}

/**
 * Copie la photo prise dans le documentDirectory (persistance §5.4.2 : le
 * brouillon survit à un kill). Best-effort : sur web (documentDirectory nul) ou
 * en cas d'échec, on renvoie l'URI d'origine.
 */
export async function persistPhoto(uri: string): Promise<string> {
	if (Platform.OS === "web") return uri;
	try {
		const legacy = await import("expo-file-system/legacy");
		const dir = legacy.documentDirectory;
		if (!dir) return uri;
		const folder = `${dir}meal-photos/`;
		await legacy.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
		const dest = `${folder}${newId()}.jpg`;
		await legacy.copyAsync({ from: uri, to: dest });
		return dest;
	} catch {
		return uri;
	}
}

/** Redimensionne (long côté ≤1092) + compresse en JPEG q0.8 et renvoie le base64. */
async function toBase64Jpeg(uri: string): Promise<string> {
	// 1er passage : dimensions (sans base64) pour choisir le long côté.
	const probe = await manipulateAsync(uri, [], { format: SaveFormat.JPEG });
	const longest = Math.max(probe.width, probe.height);
	const resize =
		longest > LONG_EDGE
			? probe.width >= probe.height
				? { resize: { width: LONG_EDGE } }
				: { resize: { height: LONG_EDGE } }
			: null;
	const out = await manipulateAsync(uri, resize ? [resize] : [], {
		compress: 0.8,
		format: SaveFormat.JPEG,
		base64: true,
	});
	if (!out.base64) throw new ScanError("bad_image");
	return out.base64;
}

/** Réponse simulée (mode démo) : un plat plausible avec ses triggers. */
function demoResponse(userNote?: string): ScanResponse {
	const dish: ScanDish = {
		name: userNote ? userNote.trim().slice(0, 60) : "assiette de pâtes à la crème",
		confidence: "medium",
		ingredients: [
			{
				name: "pâtes",
				portion: "large",
				triggers: coerceTriggers({ fodmap: "medium", gluten: true }),
			},
			{
				name: "crème fraîche",
				portion: "medium",
				triggers: coerceTriggers({ fodmap: "medium", lactose: true }),
			},
			{
				name: "parmesan",
				portion: "small",
				triggers: coerceTriggers({ fodmap: "low", additives: false }),
			},
		],
	};
	return {
		result: {
			reasoning: "démo",
			is_food: true,
			dishes: [dish],
			notes: "démo",
		},
		remaining: null,
		demo: true,
	};
}

export interface AnalyzeInput {
	uri: string;
	userNote?: string;
	entitlementToken?: string;
}

/**
 * Analyse une photo de repas. Mode démo si le proxy n'est pas configuré ;
 * sinon POST au Worker. Lève un `ScanError` typé sur tout échec.
 */
export async function analyzeMeal({
	uri,
	userNote,
	entitlementToken,
}: AnalyzeInput): Promise<ScanResponse> {
	const base = proxyUrl();
	if (!base) {
		await new Promise((r) => setTimeout(r, 1500));
		return demoResponse(userNote);
	}

	const image = await toBase64Jpeg(uri);
	const deviceId = await getDeviceId();

	let resp: Response;
	try {
		resp = await fetch(`${base.replace(/\/$/, "")}/analyze-meal`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				images: [image],
				userNote: userNote?.trim() || undefined,
				deviceId,
				entitlementToken,
			}),
		});
	} catch {
		throw new ScanError("network");
	}

	if (resp.status === 429) {
		const body = await resp.json().catch(() => ({}));
		throw new ScanError("trial_exhausted", body?.remaining ?? 0);
	}
	if (resp.status === 422) throw new ScanError("refused");
	if (!resp.ok) throw new ScanError("server");

	const body = (await resp.json().catch(() => null)) as {
		result?: ScanResult;
		remaining?: number | null;
	} | null;
	if (!body?.result) throw new ScanError("server");

	// Normalise les triggers de chaque ingrédient (comblé si partiel).
	const result: ScanResult = {
		reasoning: body.result.reasoning ?? "",
		is_food: body.result.is_food ?? true,
		notes: body.result.notes ?? "",
		dishes: (body.result.dishes ?? []).map((d) => ({
			name: d.name,
			confidence: d.confidence,
			ingredients: (d.ingredients ?? []).map((i) => ({
				name: i.name,
				portion: i.portion,
				triggers: coerceTriggers(i.triggers),
			})),
		})),
	};
	return { result, remaining: body.remaining ?? null, demo: false };
}

/** Confiance globale d'un résultat = la plus basse parmi les plats (conservateur). */
export function overallConfidence(result: ScanResult): ScanConfidence {
	const order: ScanConfidence[] = ["high", "medium", "low"];
	let worst = 0;
	for (const dish of result.dishes) {
		worst = Math.max(worst, order.indexOf(dish.confidence));
	}
	return order[worst] ?? "medium";
}

/** Aplati les ingrédients de tous les plats (pour l'édition dans le sheet). */
export function flattenIngredients(result: ScanResult): ScanIngredient[] {
	return result.dishes.flatMap((d) => d.ingredients);
}

/** Nom de repas dérivé des plats détectés. */
export function dishName(result: ScanResult): string {
	const names = result.dishes.map((d) => d.name).filter(Boolean);
	return names.join(", ");
}
