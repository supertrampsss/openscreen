/**
 * Animation « maison » du scan (§4.1) — PAS de vidéo : une carte repas qui se
 * remplit de chips détectés, en boucle de ~6 s (Animated). Montre la magie avant
 * de demander quoi que ce soit (pattern Cal AI n°1), sobre et déterministe.
 */

import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";

const CHIPS = ["FODMAP", "Lactose", "Gluten", "Friture"];
const LOOP_MS = 6000;

export function ScanAnimation() {
	const { t } = useTranslation("onboarding");
	const theme = useTheme();
	const driver = useRef(new Animated.Value(0)).current;

	useEffect(() => {
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
	}, [driver]);

	// La « photo » scanne (barre lumineuse) sur le 1er tiers, puis les chips
	// apparaissent l'un après l'autre, puis le badge de confiance.
	const scanLine = driver.interpolate({
		inputRange: [0, 0.25, 0.35, 1],
		outputRange: [0, 120, 0, 0],
	});
	const scanOpacity = driver.interpolate({
		inputRange: [0, 0.05, 0.3, 0.35, 1],
		outputRange: [0, 1, 1, 0, 0],
	});

	const chipAnims = useMemo(
		() =>
			CHIPS.map((_, i) => {
				const start = 0.35 + i * 0.1;
				return {
					opacity: driver.interpolate({
						inputRange: [start, start + 0.06, 0.95, 1],
						outputRange: [0, 1, 1, 0],
						extrapolate: "clamp",
					}),
					translateY: driver.interpolate({
						inputRange: [start, start + 0.08],
						outputRange: [8, 0],
						extrapolate: "clamp",
					}),
				};
			}),
		[driver],
	);

	const badgeOpacity = driver.interpolate({
		inputRange: [0.8, 0.86, 0.97, 1],
		outputRange: [0, 1, 1, 0],
		extrapolate: "clamp",
	});

	return (
		<View style={styles.wrap} accessibilityLabel={t("welcome.scanCaption")}>
			<View
				style={[
					styles.card,
					{ backgroundColor: theme.colors.card, borderColor: theme.colors.border },
				]}
			>
				<View style={[styles.photo, { backgroundColor: theme.colors.surface }]}>
					<Text style={styles.photoEmoji}>🍽️</Text>
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
				</View>
				<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
					{t("welcome.scanDish")}
				</Text>
				<View style={styles.chips}>
					{CHIPS.map((chip, i) => (
						<Animated.View
							key={chip}
							style={[
								styles.chip,
								{
									backgroundColor: theme.colors.surface,
									opacity: chipAnims[i].opacity,
									transform: [{ translateY: chipAnims[i].translateY }],
								},
							]}
						>
							<View style={[styles.chipDot, { backgroundColor: theme.colors.meal }]} />
							<Text style={[theme.typography.caption, { color: theme.colors.text }]}>{chip}</Text>
						</Animated.View>
					))}
				</View>
				<Animated.View style={[styles.badge, { opacity: badgeOpacity }]}>
					<View style={[styles.badgeDot, { backgroundColor: theme.colors.energy }]} />
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{t("welcome.scanCaption")}
					</Text>
				</Animated.View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { alignItems: "center", paddingVertical: 8 },
	card: {
		width: "100%",
		maxWidth: 320,
		borderRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 12,
	},
	photo: {
		height: 140,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	photoEmoji: { fontSize: 52 },
	scanLine: {
		position: "absolute",
		top: 10,
		left: 12,
		right: 12,
		height: 3,
		borderRadius: 2,
	},
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
	},
	chipDot: { width: 7, height: 7, borderRadius: 999 },
	badge: { flexDirection: "row", alignItems: "center", gap: 6 },
	badgeDot: { width: 8, height: 8, borderRadius: 999 },
});
