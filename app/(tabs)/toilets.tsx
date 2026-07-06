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
import { Card, FadeInView, PillButton } from "@/components/ui";
import {
	AFA_URGENCY_CARD_URL,
	ICI_TOILETTES_URL,
	OU_SONT_LES_TOILETTES_URL,
} from "@/constants/branding";
import { formatDistance } from "@/domain/geo";
import { haptics } from "@/services/haptics";
import {
	directionsUrl,
	fetchNearbyToilets,
	getCachedToilets,
	type ToiletWithDistance,
} from "@/services/toiletsService";
import { useTheme } from "@/theme";

/** Décalage d'apparition en cascade (§3, plafonné pour rester calme). */
const STAGGER = 40;
const staggerDelay = (i: number) => Math.min(i, 7) * STAGGER;

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
			haptics.warning();
			return;
		}
		try {
			const res = await fetchNearbyToilets(pos);
			setToilets(res);
			setCachedAgeMin(0);
			setStatus("ready");
			haptics.success();
		} catch {
			setStatus("error");
			haptics.warning();
		}
	}, []);

	const openDirections = (t2: ToiletWithDistance) => {
		haptics.selection();
		void Linking.openURL(directionsUrl(t2, Platform.OS));
	};

	// Label bilingue (fr + en) : la carte d'urgence peut être montrée à un tiers
	// qui parle l'une ou l'autre langue (§5.10, accessibilité).
	const emergencyLabel = `${i18n.getFixedT("fr", "urgence")("card.openButton")} · ${i18n.getFixedT(
		"en",
		"urgence",
	)("card.openButton")}`;

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
				<FadeInView delay={staggerDelay(0)}>
					<Text style={[theme.typography.title, { color: theme.colors.text }]}>
						{t("tabTitle")}
					</Text>
				</FadeInView>

				{/* Gros bouton carte d'urgence (1 tap → plein écran, offline). */}
				<FadeInView delay={staggerDelay(1)}>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={emergencyLabel}
						accessibilityHint={t("card.openHint")}
						testID="urgence-open"
						onPress={() => {
							haptics.impact("medium");
							router.push("/urgence");
						}}
						style={({ pressed }) => [
							styles.bigButton,
							{
								backgroundColor: theme.colors.text,
								borderRadius: theme.radii.xl,
								opacity: pressed ? 0.92 : 1,
							},
							theme.shadows.card,
						]}
					>
						<View style={[styles.bigRing, { borderColor: theme.colors.background }]}>
							<Icon name="lifebuoy" size={38} color={theme.colors.background} strokeWidth={1.8} />
						</View>
						<Text style={[styles.bigLabel, { color: theme.colors.background }]}>
							{t("card.openButton")}
						</Text>
						<Text
							style={[theme.typography.caption, styles.bigHint, { color: theme.colors.background }]}
						>
							{t("card.openHint")}
						</Text>
					</Pressable>
				</FadeInView>

				{/* Toilettes à proximité. */}
				<FadeInView delay={staggerDelay(2)}>
					<Text
						style={[
							theme.typography.overline,
							styles.groupLabel,
							{ color: theme.colors.textFaint },
						]}
					>
						{t("toilets.title")}
					</Text>
				</FadeInView>

				{status !== "ready" && status !== "loading" && toilets.length === 0 ? (
					<FadeInView delay={staggerDelay(3)}>
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
					</FadeInView>
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
								accessibilityLabel={[
									item.name ?? t("toilets.unnamed"),
									formatDistance(item.distanceM, lang),
									item.wheelchair ? t("toilets.wheelchair") : null,
									item.fee ? t("toilets.fee") : null,
								]
									.filter(Boolean)
									.join(" · ")}
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
				<FadeInView delay={staggerDelay(4)}>
					<Card style={{ gap: theme.spacing.sm }}>
						<View style={styles.franceHead}>
							<View style={[styles.avatar, { backgroundColor: theme.colors.brandSoft }]}>
								<Icon name="lifebuoy" size={20} color={theme.colors.brand} strokeWidth={1.8} />
							</View>
							<Text
								style={[
									theme.typography.subheading,
									styles.franceTitle,
									{ color: theme.colors.text },
								]}
							>
								{t("france.title")}
							</Text>
						</View>
						<Pressable
							accessibilityRole="link"
							accessibilityLabel={t("france.afa")}
							testID="afa-link"
							hitSlop={8}
							style={styles.franceLink}
							onPress={() => {
								haptics.selection();
								void Linking.openURL(AFA_URGENCY_CARD_URL);
							}}
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
								accessibilityLabel={t("france.iciToilettes")}
								hitSlop={8}
								style={styles.franceLink}
								onPress={() => {
									haptics.selection();
									void Linking.openURL(ICI_TOILETTES_URL);
								}}
							>
								<Text style={[theme.typography.caption, { color: theme.colors.meal }]}>
									{t("france.iciToilettes")}
								</Text>
							</Pressable>
							<Pressable
								accessibilityRole="link"
								accessibilityLabel={t("france.ouSontLesToilettes")}
								hitSlop={8}
								style={styles.franceLink}
								onPress={() => {
									haptics.selection();
									void Linking.openURL(OU_SONT_LES_TOILETTES_URL);
								}}
							>
								<Text style={[theme.typography.caption, { color: theme.colors.meal }]}>
									{t("france.ouSontLesToilettes")}
								</Text>
							</Pressable>
						</View>
					</Card>
				</FadeInView>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	bigButton: {
		paddingVertical: 32,
		paddingHorizontal: 20,
		alignItems: "center",
		gap: 10,
	},
	bigRing: {
		width: 72,
		height: 72,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 2,
	},
	bigLabel: { fontSize: 22, fontWeight: "800", letterSpacing: 0.5, textAlign: "center" },
	bigHint: { textAlign: "center" },
	groupLabel: { paddingHorizontal: 4, marginTop: 4 },
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
	avatar: {
		width: 42,
		height: 42,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	rowBody: { flex: 1, gap: 2 },
	franceHead: { flexDirection: "row", alignItems: "center", gap: 12 },
	franceTitle: { flex: 1 },
	franceLink: { paddingVertical: 8 },
	complements: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 4 },
});
