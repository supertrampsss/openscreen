import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * mealScanService — vérifie le CONTRAT de transport de l'entitlementToken vers
 * le proxy. C'est le filet de sécurité du correctif « Corriger sans token » :
 * si le sheet omet le token, l'abonné consomme son quota d'essai (§6, §8).
 *
 * On mocke settingsRepo (sinon `@/db/client` charge expo-sqlite, absent sous
 * Node), expo-image-manipulator (pas de vrai encodage JPEG) et react-native
 * (Platform), puis on stubbe fetch.
 */

vi.mock("@/repositories/settingsRepo", () => ({
	get: vi.fn(async () => "device-123"),
	set: vi.fn(async () => undefined),
}));

vi.mock("expo-image-manipulator", () => ({
	SaveFormat: { JPEG: "jpeg" },
	manipulateAsync: vi.fn(async (_uri: string, _actions: unknown, opts?: { base64?: boolean }) => ({
		width: 100,
		height: 100,
		base64: opts?.base64 ? "BASE64DATA" : undefined,
	})),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import { analyzeMeal } from "./mealScanService";

function okResponse(): Response {
	return new Response(
		JSON.stringify({
			result: { reasoning: "", is_food: true, dishes: [], notes: "" },
			remaining: null,
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("analyzeMeal — transmission de l'entitlementToken", () => {
	it("joint le token premium au corps de la requête (chemin abonné)", async () => {
		vi.stubEnv("EXPO_PUBLIC_AI_PROXY_URL", "https://proxy.example");
		const fetchMock = vi.fn<(input: unknown, init: { body: string }) => Promise<Response>>(
			async () => okResponse(),
		);
		vi.stubGlobal("fetch", fetchMock);

		await analyzeMeal({
			uri: "file://meal.jpg",
			userNote: "couscous",
			entitlementToken: "app-user-1",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.entitlementToken).toBe("app-user-1");
		expect(body.userNote).toBe("couscous");
		expect(body.deviceId).toBe("device-123");
	});

	it("omet le token quand il est absent (chemin essai anonyme)", async () => {
		vi.stubEnv("EXPO_PUBLIC_AI_PROXY_URL", "https://proxy.example");
		const fetchMock = vi.fn<(input: unknown, init: { body: string }) => Promise<Response>>(
			async () => okResponse(),
		);
		vi.stubGlobal("fetch", fetchMock);

		await analyzeMeal({ uri: "file://meal.jpg" });

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.entitlementToken).toBeUndefined();
	});
});
