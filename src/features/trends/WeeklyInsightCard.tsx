import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui";
import { buildInsightAggregates, type InsightAggregatesInput } from "@/domain/insightAggregates";
import { useEntitlements } from "@/services/entitlements";
import { getWeeklyInsight, type WeeklyInsight } from "@/services/weeklyInsightService";
import { useTheme } from "@/theme";

/**
 * Carte « Insight IA de la semaine » (§7) — sous le bilan hebdo local.
 * Premium only : sinon un teaser discret d'une ligne (jamais imposé). L'agrégat
 * envoyé est ANONYME (construit par `buildInsightAggregates`). Génération au 1er
 * affichage de la semaine, servie depuis le cache ensuite.
 */
export function WeeklyInsightCard({ input }: { input: InsightAggregatesInput }) {
	const { t, i18n } = useTranslation("trends");
	const theme = useTheme();
	const router = useRouter();
	const { status } = useEntitlements();

	const [insight, setInsight] = useState<WeeklyInsight | null>(null);
	const [loading, setLoading] = useState(false);

	const agg = useMemo(() => buildInsightAggregates(input), [input]);
	const lang = i18n.language === "en" ? "en" : "fr";

	const demoFallback = useMemo(
		() => ({
			headline: t("insight.demoHeadline"),
			insight: t("insight.demoBody", {
				documented: agg.documentedDays,
				avg: agg.avgStoolsPerDay ?? "—",
				painDays: agg.painDays,
				bloodDays: agg.bloodDays,
			}),
		}),
		[t, agg],
	);

	const aggRef = useRef(agg);
	aggRef.current = agg;
	const demoRef = useRef(demoFallback);
	demoRef.current = demoFallback;

	const run = useCallback(
		(force = false) => {
			if (!status.premium || aggRef.current.documentedDays === 0) {
				setInsight(null);
				return;
			}
			setLoading(true);
			getWeeklyInsight({ aggregates: aggRef.current, lang, demoFallback: demoRef.current, force })
				.then(setInsight)
				.finally(() => setLoading(false));
		},
		[status.premium, lang],
	);

	// Régénère quand le statut Premium, la langue ou le volume de données change
	// (les données arrivent après le 1er montage — sinon l'insight resterait vide).
	useEffect(() => {
		run();
	}, [run, agg.documentedDays]);

	// --- Teaser (non-Premium) : une ligne discrète. -------------------------
	if (!status.premium) {
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("insight.teaser")}
				testID="insight-teaser"
				onPress={() => router.push("/premium")}
			>
				<Card padding="md" style={styles.teaser}>
					<Text style={styles.emoji}>✨</Text>
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted, flex: 1 }]}>
						{t("insight.teaser")}
					</Text>
					<Text style={[theme.typography.subheading, { color: theme.colors.textFaint }]}>›</Text>
				</Card>
			</Pressable>
		);
	}

	return (
		<Card testID="insight-card" style={{ gap: theme.spacing.sm }}>
			<View style={styles.headerRow}>
				<Text style={[theme.typography.heading, { color: theme.colors.text, flex: 1 }]}>
					{t("insight.title")}
				</Text>
				{insight ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("insight.regenerate")}
						testID="insight-regenerate"
						onPress={() => run(true)}
						hitSlop={8}
					>
						<Text style={[theme.typography.label, { color: theme.colors.meal }]}>↻</Text>
					</Pressable>
				) : null}
			</View>

			{agg.documentedDays === 0 ? (
				<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
					{t("insight.empty")}
				</Text>
			) : loading && !insight ? (
				<View style={styles.loadingRow}>
					<ActivityIndicator color={theme.colors.meal} />
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{t("insight.loading")}
					</Text>
				</View>
			) : insight ? (
				<>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{insight.headline}
					</Text>
					<Text testID="insight-body" style={[theme.typography.body, { color: theme.colors.text }]}>
						{insight.insight}
					</Text>
					<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
						{t("insight.disclaimer")}
					</Text>
				</>
			) : (
				<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
					{t("insight.empty")}
				</Text>
			)}
		</Card>
	);
}

const styles = StyleSheet.create({
	teaser: { flexDirection: "row", alignItems: "center", gap: 10 },
	emoji: { fontSize: 18 },
	headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
