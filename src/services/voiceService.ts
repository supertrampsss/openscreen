/**
 * Note vocale (§5.4, §6.1, §7, §11-bis).
 *
 * PRIVACY : la reconnaissance vocale est ON-DEVICE. Le chemin PRINCIPAL est la
 * dictée clavier du système (iOS/Android) — zéro dépendance, vrai STT local. Un
 * bouton micro optionnel utilise l'API Web Speech quand elle est disponible
 * (web). AUCUN audio n'est jamais uploadé : seul le TEXTE part au proxy.
 *
 * `/parse-voice` est PREMIUM (§8). MODE DÉMO : si `EXPO_PUBLIC_AI_PROXY_URL` est
 * absent, on renvoie des entrées simulées marquées `demo:true`, pour que le flow
 * reste testable de bout en bout sans backend.
 */

import { nowEntryTimestamp } from "@/domain/dates";
import type { RawVoiceEntry, VoiceDraft } from "@/domain/voiceEntries";
import {
	commitDraft as commitMealDraft,
	newMealId,
	upsertDraft as upsertMealDraft,
} from "@/repositories/mealRepo";
import {
	commitDraft as commitSymptomDraft,
	newEntryId,
	upsertDraft as upsertSymptomDraft,
} from "@/repositories/symptomRepo";
import { getDeviceId, proxyUrl } from "./mealScanService";

// ---------------------------------------------------------------------------
// STT on-device — interface + implémentations (web Web Speech, natif stub).
// ---------------------------------------------------------------------------

export interface SpeechHandlers {
	/** Transcription partielle/finale (on remplace le champ à chaque appel). */
	onResult: (transcript: string) => void;
	onEnd?: () => void;
	onError?: () => void;
}

export interface SpeechRecognizer {
	/** Vrai si un moteur STT natif d'écoute continue est disponible (web only). */
	readonly available: boolean;
	start(handlers: SpeechHandlers): void;
	stop(): void;
}

/** Stub natif : STT système = dictée clavier (chemin principal, sans dépendance). */
const UNAVAILABLE: SpeechRecognizer = {
	available: false,
	start: () => undefined,
	stop: () => undefined,
};

type WebSpeechCtor = new () => {
	lang: string;
	interimResults: boolean;
	continuous: boolean;
	onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
	onerror: (() => void) | null;
	onend: (() => void) | null;
	start(): void;
	stop(): void;
};

/**
 * Recognizer pour la langue courante (« fr » → fr-FR). Sur web, utilise
 * `webkitSpeechRecognition`/`SpeechRecognition` si présent ; sinon (et sur
 * natif) renvoie le stub `available:false` → l'UI n'affiche pas le bouton micro
 * et l'utilisateur dicte via le clavier système.
 */
export function createSpeechRecognizer(lang: string): SpeechRecognizer {
	const g = globalThis as unknown as {
		webkitSpeechRecognition?: WebSpeechCtor;
		SpeechRecognition?: WebSpeechCtor;
	};
	const Ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
	if (!Ctor) return UNAVAILABLE;

	let rec: InstanceType<WebSpeechCtor> | null = null;
	return {
		available: true,
		start(handlers) {
			try {
				rec = new Ctor();
				rec.lang = lang === "en" ? "en-US" : "fr-FR";
				rec.interimResults = true;
				rec.continuous = true;
				rec.onresult = (e) => {
					let text = "";
					for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? "";
					handlers.onResult(text.trim());
				};
				rec.onerror = () => handlers.onError?.();
				rec.onend = () => handlers.onEnd?.();
				rec.start();
			} catch {
				handlers.onError?.();
			}
		},
		stop() {
			try {
				rec?.stop();
			} catch {
				// no-op
			}
		},
	};
}

// ---------------------------------------------------------------------------
// /parse-voice — texte → entrées structurées (proxy ou démo).
// ---------------------------------------------------------------------------

export type VoiceErrorKind = "premium_required" | "network" | "server" | "refused" | "empty";

export class VoiceError extends Error {
	readonly kind: VoiceErrorKind;
	constructor(kind: VoiceErrorKind) {
		super(kind);
		this.name = "VoiceError";
		this.kind = kind;
	}
}

export interface VoiceParseResult {
	entries: RawVoiceEntry[];
	/** Réponse simulée locale (proxy non configuré). */
	demo: boolean;
}

/** Entrées simulées (mode démo) — l'exemple canonique du placeholder (§9). */
function demoEntries(): RawVoiceEntry[] {
	return [
		{ type: "stool", bristol: 6, count: 3, timeOfDay: "morning" },
		{ type: "symptom", pain: 2 },
		{ type: "meal", name: "raclette", timeOfDay: "yesterday_evening" },
	];
}

/**
 * Envoie le TEXTE (jamais l'audio) au proxy `/parse-voice`. Premium requis côté
 * Worker (403 → `premium_required`). Mode démo si proxy absent.
 */
export async function parseVoice(
	transcript: string,
	entitlementToken?: string,
): Promise<VoiceParseResult> {
	const text = transcript.trim();
	if (!text) throw new VoiceError("empty");

	const base = proxyUrl();
	if (!base) {
		await new Promise((r) => setTimeout(r, 900));
		return { entries: demoEntries(), demo: true };
	}

	const deviceId = await getDeviceId();
	let resp: Response;
	try {
		resp = await fetch(`${base.replace(/\/$/, "")}/parse-voice`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ transcript: text, deviceId, entitlementToken }),
		});
	} catch {
		throw new VoiceError("network");
	}

	if (resp.status === 403) throw new VoiceError("premium_required");
	if (resp.status === 422) throw new VoiceError("refused");
	if (!resp.ok) throw new VoiceError("server");

	const body = (await resp.json().catch(() => null)) as {
		result?: { entries?: RawVoiceEntry[] };
	} | null;
	if (!body?.result) throw new VoiceError("server");
	return { entries: body.result.entries ?? [], demo: false };
}

// ---------------------------------------------------------------------------
// Commit — chaque brouillon via les repos existants (§5.4 DraftSheet commun).
// ---------------------------------------------------------------------------

/**
 * Committe les brouillons voix confirmés. Une entrée « selle » de compte N crée
 * N selles (chacune une ligne, comme si l'utilisateur les avait saisies une à
 * une). Renvoie le nombre d'entrées effectivement enregistrées.
 */
export async function commitVoiceDrafts(drafts: VoiceDraft[]): Promise<number> {
	let saved = 0;
	for (const draft of drafts) {
		if (draft.type === "stool") {
			for (let i = 0; i < draft.count; i++) {
				const id = newEntryId();
				await upsertSymptomDraft({
					id,
					kind: "stool",
					occurredAt: draft.occurredAt.epochMs,
					tz: draft.occurredAt.tz,
					localDate: draft.occurredAt.localDate,
					bristol: draft.bristol,
					// La note (ex. « un peu de sang ») n'est portée que par la 1re selle.
					notes: i === 0 ? draft.notes : null,
				});
				await commitSymptomDraft(id);
				saved += 1;
			}
		} else if (draft.type === "symptom") {
			const id = newEntryId();
			await upsertSymptomDraft({
				id,
				kind: "symptom",
				occurredAt: draft.occurredAt.epochMs,
				tz: draft.occurredAt.tz,
				localDate: draft.occurredAt.localDate,
				pain: draft.pain,
				fatigue: draft.fatigue,
				notes: draft.notes,
			});
			await commitSymptomDraft(id);
			saved += 1;
		} else {
			const id = newMealId();
			await upsertMealDraft({
				id,
				occurredAt: draft.occurredAt.epochMs,
				tz: draft.occurredAt.tz,
				localDate: draft.occurredAt.localDate,
				name: draft.name,
				source: "voice",
			});
			await commitMealDraft(id);
			saved += 1;
		}
	}
	return saved;
}

/** Horodatage « maintenant » — base du mapping timeOfDay (réexport pratique). */
export function voiceBaseTimestamp() {
	return nowEntryTimestamp();
}
