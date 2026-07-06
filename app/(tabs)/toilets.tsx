/**
 * Onglet Urgence (§5.10) — accès pouce au cœur de la tab bar.
 *
 *  - En tête : gros bouton « CARTE D'URGENCE » (1 tap → carte plein écran offline).
 *  - « Toilettes à proximité » : localisation OPT-IN → Overpass (anonyme) → liste
 *    triée par distance, itinéraire GPS. États propres hors-ligne / refus. Cache
 *    du dernier résultat. La carte d'urgence reste toujours accessible.
 *  - Note France : lien vers la Carte Urgence Toilettes de l'afa + compléments.
 *
 * PRIVACY (§2 loi 4) : la position ne quitte l'appareil que vers Overpass, en
 * requête anonyme. Aucun tracking, aucun stockage tiers.
 */

import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Card, PillButton } from "@/components/ui";
import {
	AFA_URGENCY_CARD_URL,
	ICI_TOILETTES_URL,
	OU_SONT_LES_TOILETTES_URL,
} from "@/constants/branding";
import { formatDistance } from "@/domain/geo";
import {
	directionsUrl,
	fetchNearbyToilets,
	getCachedToilets,
	type ToiletWithDistance,
} from "@/services/toiletsService";
import { useTheme } from "@/theme";

type Status = "idle" | "loading" | "ready" | "denied" | "error";

/** Position courante, ou "denied" si refusée/indisponible. Web = geolocation. */
async function getPosition(): Promise<{ lat: number; lon: number } | "denied"> {
	if (Platform.OS === "web") {
		if (typeof navigator === "undefined" || !navigator.geolocation) return "denied";
		return new Promise((resolve) => {
			navigator.geolocation.getCurrentPosition(
				(pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
				() => resolve("denied"),
				{ timeout: 8000 },
			);
		});
	}
	const Location = await import("expo-location");
	const perm = await Location.requestForegroundPermissionsAsync();
	if (!perm.granted) return "denied";
	const pos = await Location.getCurrentPositionAsync({});
	return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}

export default function ToiletsTab() {
	const { t, i18n } = useTranslation("urgence");
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();

	const [status, setStatus] = useState<Status>("idle");
	const [toilets, setToilets] = useState<ToiletWithDistance[]>([]);
	const [cachedAgeMin, setCachedAgeMin] = useState<number | null>(null);

	// Réaffiche le dernier résultat mis en cache (avec son ancienneté).
	useEffect(() => {
		getCachedToilets().then((c) => {
			if (c) {
				setToilets(c.toilets);
				setCachedAgeMin(Math.max(0, Math.round((Date.now() - c.fetchedAt) / 60000)));
			}
		});
	}, []);

	const search = useCallback(async () => {
		setStatus("loading");
		const pos = await getPosition();
		if (pos === "denied") {
			setStatus("denied");
			return;
		}
		try {
			const res = await fetchNearbyToilets(pos);
			setToilets(res);
			setCachedAgeMin(0);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	const openDirections = (t2: ToiletWithDistance) => {
		void Linking.openURL(directionsUrl(t2, Platform.OS));
	};

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			<ScrollView
				contentContainerStyle={{
					padding: theme.spacing.lg,
					paddingTop: insets.top + theme.spacing.md,
					paddingBottom: insets.bottom + 24,
					gap: theme.spacing.lg,
				}}
			>
				<Text style={[theme.typography.title, { color: theme.colors.text }]}>{t("tabTitle")}</Text>

				{/* Gros bouton carte d'urgence (1 tap → plein écran, offline). */}
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("card.openButton")}
					testID="urgence-open"
					onPress={() => router.push("/urgence")}
					style={[styles.bigButton, { backgroundColor: theme.colors.text }]}
				>
					<Icon name="lifebuoy" size={38} color={theme.colors.background} strokeWidth={1.8} />
					<Text style={[styles.bigLabel, { color: theme.colors.background }]}>
						{t("card.openButton")}
					</Text>
					<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
						{t("card.openHint")}
					</Text>
				</Pressable>

				{/* Toilettes à proximité. */}
				<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
					{t("toilets.title")}
				</Text>

				{status !== "ready" && status !== "loading" && toilets.length === 0 ? (
					<Card style={{ gap: theme.spacing.md }}>
						<PillButton
							label={t("toilets.enable")}
							testID="toilets-enable"
							onPress={() => void search()}
							accessibilityLabel={t("toilets.enable")}
						/>
						<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
							{t("toilets.privacy")}
						</Text>
					</Card>
				) : null}

				{status === "loading" ? (
					<Card>
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("toilets.loading")}
						</Text>
					</Card>
				) : null}

				{status === "denied" ? (
					<Card testID="toilets-denied" style={{ gap: theme.spacing.md }}>
						<Text style={[theme.typography.body, { color: theme.colors.text }]}>
							{t("toilets.denied")}
						</Text>
						<PillButton
							label={t("toilets.retry")}
							variant="secondary"
							onPress={() => void search()}
							accessibilityLabel={t("toilets.retry")}
						/>
					</Card>
				) : null}

				{status === "error" ? (
					<Card testID="toilets-error" style={{ gap: theme.spacing.md }}>
						<Text style={[theme.typography.body, { color: theme.colors.text }]}>
							{t("toilets.offline")}
						</Text>
						<PillButton
							label={t("toilets.retry")}
							variant="secondary"
							onPress={() => void search()}
							accessibilityLabel={t("toilets.retry")}
						/>
					</Card>
				) : null}

				{/* Bannière « dernier résultat il y a X min » (cache). */}
				{toilets.length > 0 && cachedAgeMin != null && status !== "loading" ? (
					<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
						{cachedAgeMin === 0
							? t("toilets.justNow")
							: t("toilets.cachedAt", { minutes: cachedAgeMin })}
					</Text>
				) : null}

				{toilets.length > 0 ? (
					<View style={{ gap: theme.spacing.sm }}>
						{toilets.slice(0, 20).map((item) => (
							<Pressable
								key={item.id}
								accessibilityRole="button"
								testID="toilet-row"
								accessibilityLabel={item.name ?? t("toilets.unnamed")}
								onPress={() => openDirections(item)}
							>
								<Card padding="md" style={styles.row}>
									<View style={[styles.avatar, { backgroundColor: theme.colors.brandSoft }]}>
										<Icon name="pin" size={20} color={theme.colors.brand} strokeWidth={1.8} />
									</View>
									<View style={styles.rowBody}>
										<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
											{item.name ?? t("toilets.unnamed")}
										</Text>
										<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
											{formatDistance(item.distanceM, lang)}
											{item.wheelchair ? ` · ${t("toilets.wheelchair")}` : ""}
											{item.fee ? ` · ${t("toilets.fee")}` : ""}
										</Text>
									</View>
									<Icon name="chevronRight" size={20} color={theme.colors.textFaint} />
								</Card>
							</Pressable>
						))}
					</View>
				) : status === "ready" ? (
					<Card>
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("toilets.empty")}
						</Text>
					</Card>
				) : null}

				{/* Note France : afa + compléments communautaires. */}
				<Card style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{t("france.title")}
					</Text>
					<Pressable
						accessibilityRole="link"
						testID="afa-link"
						onPress={() => void Linking.openURL(AFA_URGENCY_CARD_URL)}
					>
						<Text style={[theme.typography.body, { color: theme.colors.meal }]}>
							{t("france.afa")}
						</Text>
					</Pressable>
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{t("france.afaBody")}
					</Text>
					<View style={styles.complements}>
						<Pressable
							accessibilityRole="link"
							onPress={() => void Linking.openURL(ICI_TOILETTES_URL)}
						>
							<Text style={[theme.typography.caption, { color: theme.colors.meal }]}>
								{t("france.iciToilettes")}
							</Text>
						</Pressable>
						<Pressable
							accessibilityRole="link"
							onPress={() => void Linking.openURL(OU_SONT_LES_TOILETTES_URL)}
						>
							<Text style={[theme.typography.caption, { color: theme.colors.meal }]}>
								{t("france.ouSontLesToilettes")}
							</Text>
						</Pressable>
					</View>
				</Card>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	bigButton: {
		borderRadius: 20,
		paddingVertical: 28,
		alignItems: "center",
		gap: 8,
	},
	bigLabel: { fontSize: 22, fontWeight: "800", letterSpacing: 0.5 },
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
	avatar: {
		width: 42,
		height: 42,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	rowBody: { flex: 1, gap: 2 },
	complements: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 4 },
});
