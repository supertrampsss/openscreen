import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock du repo settings (sinon l'import charge `@/db/client` = expo-sqlite,
// indisponible sous Node). Store mémoire pour exercer la persistance.
const store = new Map<string, unknown>();
vi.mock("@/repositories/settingsRepo", () => ({
	get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
	set: vi.fn(async (key: string, value: unknown) => {
		store.set(key, value);
	}),
}));

import { AI_CONSENT_KEY, hasAiConsent, setAiConsent } from "./aiConsent";

describe("aiConsent", () => {
	beforeEach(() => store.clear());

	it("absent par défaut → pas de consentement", async () => {
		expect(await hasAiConsent()).toBe(false);
	});

	it("setAiConsent(true) persiste sous la clé ai_consent et se relit", async () => {
		await setAiConsent(true);
		expect(store.get(AI_CONSENT_KEY)).toBe(true);
		expect(await hasAiConsent()).toBe(true);
	});

	it("setAiConsent(false) révoque le consentement", async () => {
		await setAiConsent(true);
		await setAiConsent(false);
		expect(await hasAiConsent()).toBe(false);
	});

	it("ne renvoie true que pour la valeur booléenne exacte", async () => {
		store.set(AI_CONSENT_KEY, "yes");
		expect(await hasAiConsent()).toBe(false);
	});
});
