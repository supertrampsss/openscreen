/**
 * Mini-graphe de l'interstitiel preuve (§4.8) — deux barres SVG « sans suivi »
 * vs « avec suivi ». Illustratif (source afa citée en petit dans l'écran).
 */

import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useTheme } from "@/theme";

export function ProofChart() {
	const { t } = useTranslation("onboarding");
	const theme = useTheme();
	const w = 220;
	const h = 120;
	const barW = 56;
	const gap = 48;
	const x1 = (w - barW * 2 - gap) / 2;
	const x2 = x1 + barW + gap;
	const lowH = 40;
	const highH = 100;

	return (
		<View style={styles.wrap}>
			<Svg width={w} height={h} accessibilityLabel={t("proof.chartLabel")}>
				<Rect x={x1} y={h - lowH} width={barW} height={lowH} rx={6} fill={theme.colors.border} />
				<Rect x={x2} y={h - highH} width={barW} height={highH} rx={6} fill={theme.colors.energy} />
			</Svg>
			<View style={[styles.labels, { width: w }]}>
				<Text style={[theme.typography.caption, styles.label, { color: theme.colors.textMuted }]}>
					{t("proof.chartBefore")}
				</Text>
				<Text style={[theme.typography.caption, styles.label, { color: theme.colors.text }]}>
					{t("proof.chartAfter")}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { alignItems: "center", gap: 6 },
	labels: { flexDirection: "row", justifyContent: "space-around" },
	label: { textAlign: "center", flex: 1 },
});
