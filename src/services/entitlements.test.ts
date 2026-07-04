import { beforeEach, describe, expect, it } from "vitest";
import {
	createEntitlementsProvider,
	type EntitlementsStore,
	entitlementsProviderName,
	MOCK_ENTITLEMENT_TOKEN,
	MockEntitlementsProvider,
	PLACEHOLDER_OFFERINGS,
	RevenueCatEntitlementsProvider,
} from "./entitlements";

/** Store mémoire (aucune dépendance DB/RN) pour exercer le provider mock. */
function memStore(): EntitlementsStore {
	const map = new Map<string, unknown>();
	return {
		async get<T>(key: string) {
			return (map.has(key) ? (map.get(key) as T) : null) as T | null;
		},
		async set(key: string, value: unknown) {
			map.set(key, value);
		},
	};
}

describe("MockEntitlementsProvider", () => {
	let provider: MockEntitlementsProvider;
	beforeEach(() => {
		provider = new MockEntitlementsProvider(memStore(), 0);
	});

	it("démarre non-premium, sans jeton", async () => {
		const status = await provider.getStatus();
		expect(status).toEqual({ premium: false, source: "mock" });
		expect(await provider.getEntitlementToken()).toBeNull();
	});

	it("expose les prix placeholders immédiatement", async () => {
		const off = await provider.getOfferings();
		expect(off).toEqual(PLACEHOLDER_OFFERINGS);
		expect(off.monthly.price).toBeTruthy();
		expect(off.annual.price).toBeTruthy();
		expect(off.annual.monthlyEquivalent).toBeTruthy();
	});

	it("purchase → premium true, persistant, avec jeton", async () => {
		const res = await provider.purchase("annual");
		expect(res).toEqual({ ok: true, premium: true });
		expect((await provider.getStatus()).premium).toBe(true);
		expect(await provider.getEntitlementToken()).toBe(MOCK_ENTITLEMENT_TOKEN);
	});

	it("restore reflète l'état persisté", async () => {
		expect((await provider.restore()).premium).toBe(false);
		await provider.purchase("monthly");
		expect((await provider.restore()).premium).toBe(true);
	});

	it("devTogglePremium bascule l'état", async () => {
		expect(await provider.devTogglePremium()).toBe(true);
		expect((await provider.getStatus()).premium).toBe(true);
		expect(await provider.devTogglePremium()).toBe(false);
		expect((await provider.getStatus()).premium).toBe(false);
	});
});

describe("sélection du provider par l'environnement", () => {
	const original = process.env.EXPO_PUBLIC_ENTITLEMENTS;
	beforeEach(() => {
		process.env.EXPO_PUBLIC_ENTITLEMENTS = original;
	});

	it("défaut = mock", () => {
		process.env.EXPO_PUBLIC_ENTITLEMENTS = undefined;
		expect(entitlementsProviderName()).toBe("mock");
		expect(createEntitlementsProvider("mock", memStore())).toBeInstanceOf(MockEntitlementsProvider);
	});

	it("revenuecat quand demandé explicitement", () => {
		process.env.EXPO_PUBLIC_ENTITLEMENTS = "revenuecat";
		expect(entitlementsProviderName()).toBe("revenuecat");
		expect(createEntitlementsProvider("revenuecat", memStore())).toBeInstanceOf(
			RevenueCatEntitlementsProvider,
		);
	});
});

describe("RevenueCatEntitlementsProvider (squelette non configuré)", () => {
	const provider = new RevenueCatEntitlementsProvider();
	const msg = "RevenueCat non configuré — voir docs/RELEASE.md";

	it("lève un message explicite pointant vers la doc", async () => {
		await expect(provider.getStatus()).rejects.toThrow(msg);
		await expect(provider.getOfferings()).rejects.toThrow(msg);
		await expect(provider.purchase("monthly")).rejects.toThrow(msg);
		await expect(provider.restore()).rejects.toThrow(msg);
		await expect(provider.getEntitlementToken()).rejects.toThrow(msg);
	});
});
