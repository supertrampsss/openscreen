/**
 * Démonstration « photo → l'IA détecte » (§4.1) — PAS de vidéo : une carte repas
 * crédible dont la vignette se fait scanner, puis les déclencheurs apparaissent en
 * cascade (FODMAP, Fibres, Épicé) et un badge de confiance se pose. Montre la magie
 * AVANT de demander quoi que ce soit (pattern Cal AI n°1). Boucle ~6 s, déterministe,
 * respecte « réduire les animations » (rendu statique, résultat visible).
 */

import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { Card, ChipTrigger } from "@/components/ui";
import type { DataColorKey } from "@/theme";
import { useTheme } from "@/theme";

const LOOP_MS = 6200;

interface Trigger {
	label: string;
	level?: string;
	tint: DataColorKey;
}

export function ScanAnimation() {
	const { t, i18n } = useTranslation("onboarding");
	const theme = useTheme();
	const reduceMotion = useReducedMotion();
	const driver = useRef(new Animated.Value(0)).current;

	// Déclencheurs « détectés » — teintes de donnée, jamais dans le chrome.
	const triggers = useMemo<Trigger[]>(() => {
		const fr = i18n.language?.startsWith("fr");
		return [
			{ label: "FODMAP", level: fr ? "élevé" : "high", tint: "meal" },
			{ label: fr ? "Fibres" : "Fibre", tint: "energy" },
			{ label: fr ? "Épicé" : "Spicy", tint: "pain" },
		];
	}, [i18n.language]);

	useEffect(() => {
		if (reduceMotion) {
			driver.setValue(1);
			return;
		}
		driver.setValue(0);
		const anim = Animated.loop(
			Animated.timing(driver, {
				toValue: 1,
				duration: LOOP_MS,
				easing: Easing.inOut(Easing.ease),
				useNativeDriver: true,
			}),
		);
		anim.start();
		return () => anim.stop();
	}, [driver, reduceMotion]);

	// La vignette scanne (barre lumineuse) sur le 1er tiers, puis les chips
	// entrent l'un après l'autre, puis le badge de confiance se pose.
	const scanLine = driver.interpolate({
		inputRange: [0, 0.06, 0.3, 0.34, 1],
		outputRange: [4, 4, 112, 4, 4],
	});
	const scanOpacity = driver.interpolate({
		inputRange: [0, 0.05, 0.3, 0.36, 1],
		outputRange: [0, 1, 1, 0, 0],
	});
	const scanGlow = driver.interpolate({
		inputRange: [0, 0.06, 0.32, 0.36, 1],
		outputRange: [0, 0.14, 0.14, 0, 0],
	});

	const chipAnims = useMemo(
		() =>
			triggers.map((_, i) => {
				const start = 0.4 + i * 0.11;
				return {
					opacity: driver.interpolate({
						inputRange: [start, start + 0.06, 0.92, 1],
						outputRange: [0, 1, 1, 0],
						extrapolate: "clamp",
					}),
					transform: [
						{
							translateY: driver.interpolate({
								inputRange: [start, start + 0.08],
								outputRange: [10, 0],
								extrapolate: "clamp",
							}),
						},
						{
							scale: driver.interpolate({
								inputRange: [start, start + 0.09],
								outputRange: [0.9, 1],
								extrapolate: "clamp",
							}),
						},
					],
				};
			}),
		[driver, triggers],
	);

	const badgeOpacity = driver.interpolate({
		inputRange: [0.78, 0.85, 0.92, 1],
		outputRange: [0, 1, 1, 0],
		extrapolate: "clamp",
	});

	return (
		<View style={styles.wrap} accessibilityLabel={t("welcome.scanCaption")}>
			<Card padding="md" style={styles.card}>
				{/* Vignette repas — placeholder mealSoft + icône couverts, cadre caméra. */}
				<View style={[styles.photo, { backgroundColor: theme.colors.mealSoft }]}>
					<Icon name="utensils" size={44} color={theme.colors.meal} strokeWidth={1.6} />
					<Corner pos="tl" color={theme.colors.meal} />
					<Corner pos="tr" color={theme.colors.meal} />
					<Corner pos="bl" color={theme.colors.meal} />
					<Corner pos="br" color={theme.colors.meal} />
					{!reduceMotion ? (
						<>
							<Animated.View
								style={[styles.scanGlow, { backgroundColor: theme.colors.meal, opacity: scanGlow }]}
							/>
							<Animated.View
								style={[
									styles.scanLine,
									{
										backgroundColor: theme.colors.meal,
										opacity: scanOpacity,
										transform: [{ translateY: scanLine }],
									},
								]}
							/>
						</>
					) : null}
				</View>

				{/* Résultat « détecté » : nom du plat + badge de confiance. */}
				<View style={styles.resultRow}>
					<View style={styles.resultText}>
						<Text style={[theme.typography.overline, { color: theme.colors.textFaint }]}>
							{t("welcome.scanCaption")}
						</Text>
						<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
							{t("welcome.scanDish")}
						</Text>
					</View>
					<Animated.View style={[styles.badge, reduceMotion ? null : { opacity: badgeOpacity }]}>
						<View style={[styles.badgeIcon, { backgroundColor: theme.colors.energySoft }]}>
							<Icon name="check" size={14} color={theme.colors.energy} strokeWidth={2.4} />
						</View>
					</Animated.View>
				</View>

				{/* Déclencheurs détectés — entrent en cascade. */}
				<View style={styles.chips}>
					{triggers.map((trigger, i) => (
						// En mode « réduire les animations » : chips en place, rien ne bouge.
						<Animated.View key={trigger.label} style={reduceMotion ? undefined : chipAnims[i]}>
							<ChipTrigger label={trigger.label} level={trigger.level} tint={trigger.tint} />
						</Animated.View>
					))}
				</View>
			</Card>
		</View>
	);
}

/** Coin de cadrage caméra (repère d'angle discret). */
function Corner({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
	const edge = {
		tl: { top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2 },
		tr: { top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2 },
		bl: { bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2 },
		br: { bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2 },
	}[pos];
	return <View style={[styles.corner, { borderColor: color }, edge]} />;
}

const styles = StyleSheet.create({
	wrap: { alignItems: "center", paddingVertical: 4 },
	card: { width: "100%", maxWidth: 300, gap: 14 },
	photo: {
		height: 132,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	corner: { position: "absolute", width: 16, height: 16, borderRadius: 3, opacity: 0.5 },
	scanLine: {
		position: "absolute",
		top: 0,
		left: 14,
		right: 14,
		height: 2,
		borderRadius: 2,
	},
	scanGlow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
	resultRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	resultText: { flex: 1, gap: 2 },
	badge: { flexDirection: "row", alignItems: "center" },
	badgeIcon: {
		width: 26,
		height: 26,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
