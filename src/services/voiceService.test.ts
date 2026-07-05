import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryTimestamp } from "@/domain/dates";
import type { VoiceDraft } from "@/domain/voiceEntries";

// Repos mockés : on trace les commits par id pour détecter les doublons. Chaque
// upsert « crée » la ligne (idempotent par id), chaque commit l'ajoute au journal
// des commits (un id commité deux fois n'est PAS une nouvelle ligne).
const rows = new Map<string, { committed: boolean }>();
const commitCalls: string[] = [];

let symptomSeq = 0;
let mealSeq = 0;

vi.mock("@/repositories/symptomRepo", () => ({
	newEntryId: vi.fn(() => `sym-${++symptomSeq}`),
	upsertDraft: vi.fn(async (e: { id: string }) => {
		rows.set(e.id, { committed: false });
	}),
	commitDraft: vi.fn(async (id: string) => {
		commitCalls.push(id);
		const r = rows.get(id);
		if (!r) throw new Error(`commitDraft: no draft row for id ${id}`);
		r.committed = true;
	}),
}));

vi.mock("@/repositories/mealRepo", () => ({
	newMealId: vi.fn(() => `meal-${++mealSeq}`),
	upsertDraft: vi.fn(async (e: { id: string }) => {
		rows.set(e.id, { committed: false });
	}),
	commitDraft: vi.fn(async (id: string) => {
		commitCalls.push(id);
		const r = rows.get(id);
		if (!r) throw new Error(`commitDraft: no draft row for id ${id}`);
		r.committed = true;
	}),
}));

// Évite de charger la chaîne expo (mealScanService → expo-sqlite) à l'import.
vi.mock("./mealScanService", () => ({ getDeviceId: vi.fn(), proxyUrl: vi.fn() }));

import { commitDraft as commitMealDraft } from "@/repositories/mealRepo";
import { commitVoiceDrafts } from "./voiceService";

const ts: EntryTimestamp = {
	epochMs: 1_700_000_000_000,
	tz: "Europe/Paris",
	localDate: "2023-11-14",
};

describe("commitVoiceDrafts — idempotence (loi 2)", () => {
	beforeEach(() => {
		rows.clear();
		commitCalls.length = 0;
		symptomSeq = 0;
		mealSeq = 0;
	});

	it("crée exactement une ligne par entrée (selle count=N → N lignes)", async () => {
		const drafts: VoiceDraft[] = [
			{ type: "stool", occurredAt: ts, bristol: 5, count: 2, notes: null },
			{ type: "symptom", occurredAt: ts, pain: 1, fatigue: 2, notes: null },
			{ type: "meal", occurredAt: ts, name: "Riz", notes: null },
		];
		const saved = await commitVoiceDrafts(drafts);
		expect(saved).toBe(4); // 2 selles + 1 symptôme + 1 repas
		expect(rows.size).toBe(4);
	});

	it("un ré-enregistrement du MÊME lot après échec partiel ne duplique rien", async () => {
		const drafts: VoiceDraft[] = [
			{ type: "stool", occurredAt: ts, bristol: 5, count: 1, notes: null },
			{ type: "symptom", occurredAt: ts, pain: 1, fatigue: null, notes: null },
			{ type: "meal", occurredAt: ts, name: "Riz", notes: null },
		];

		// 1re tentative : le commit du repas échoue une fois (erreur transitoire).
		vi.mocked(commitMealDraft).mockRejectedValueOnce(new Error("transient"));
		await expect(commitVoiceDrafts(drafts)).rejects.toThrow("transient");

		// La selle et le symptôme ont été commités ; le repas a échoué.
		const committedAfterFirst = [...rows.entries()].filter(([, r]) => r.committed).length;
		expect(committedAfterFirst).toBe(2);

		// 2e tentative sur le MÊME tableau de brouillons (feuille restée ouverte).
		const saved = await commitVoiceDrafts(drafts);
		expect(saved).toBe(3);

		// Invariant clé : toujours 3 lignes au total (pas de doublon selle/symptôme).
		expect(rows.size).toBe(3);
		expect([...rows.values()].every((r) => r.committed)).toBe(true);
	});
});
