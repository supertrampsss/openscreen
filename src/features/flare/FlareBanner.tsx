/**
 * Bandeau « mode poussée » (§5.6, §3) — ambre pâle, JAMAIS rouge (§2 loi 3).
 * Affiché sur Home et Journal quand la poussée est active. Copy bienveillant.
 */

import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";
import { useFlare } from "./FlareContext";

export function FlareBanner() {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const { flare } = useFlare();

	if (!flare.active) return null;

	return (
		<View
			testID="flare-banner"
			accessibilityRole="alert"
			style={[
				styles.wrap,
				{
					backgroundColor: theme.colors.flareBackground,
					borderColor: theme.colors.flareBorder,
					borderRadius: theme.radii.md,
				},
			]}
		>
			<Text style={styles.emoji}>🌙</Text>
			<Text style={[theme.typography.label, styles.text, { color: theme.colors.pain }]}>
				{t("flare.banner")}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	emoji: { fontSize: 18 },
	text: { flex: 1 },
});
