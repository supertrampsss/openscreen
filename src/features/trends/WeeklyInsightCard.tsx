import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Card, PillButton } from "@/components/ui";
import { buildInsightAggregates, type InsightAggregatesInput } from "@/domain/insightAggregates";
import { AiConsentSheet } from "@/features/log/AiConsentSheet";
import { hasAiConsent } from "@/services/aiConsent";
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
	const { t: tc } = useTranslation("aiConsent");
	const theme = useTheme();
	const router = useRouter();
	const { status } = useEntitlements();

	const [insight, setInsight] = useState<WeeklyInsight | null>(null);
	const [loading, setLoading] = useState(false);
	// Consentement IA tierce (§2 loi 4) requis avant d'envoyer les agrégats.
	const [needsConsent, setNeedsConsent] = useState(false);
	const [consentOpen, setConsentOpen] = useState(false);

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

	const run = useCallback(
		(force = false) => {
			if (!status.premium || agg.documentedDays === 0) {
				setInsight(null);
				return;
			}
			setLoading(true);
			// Ne rien transmettre à l'IA tierce sans consentement explicite (§2 loi 4) :
			// on affiche alors une invite plutôt que d'envoyer les agrégats.
			hasAiConsent().then((consented) => {
				if (!consented) {
					setNeedsConsent(true);
					setInsight(null);
					setLoading(false);
					return;
				}
				setNeedsConsent(false);
				getWeeklyInsight({ aggregates: agg, lang, demoFallback, force })
					.then(setInsight)
					.finally(() => setLoading(false));
			});
		},
		[status.premium, agg, lang, demoFallback],
	);

	// Régénère quand le statut Premium, la langue ou les agrégats changent (les
	// données arrivent après le 1er montage — sinon l'insight resterait vide). Le
	// cache par semaine évite toute régénération superflue.
	useEffect(() => {
		run();
	}, [run]);

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
					<Icon name="sparkles" size={18} color={theme.colors.brand} strokeWidth={1.7} />
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted, flex: 1 }]}>
						{t("insight.teaser")}
					</Text>
					<Icon name="chevronRight" size={18} color={theme.colors.textFaint} />
				</Card>
			</Pressable>
		);
	}

	return (
		<Card testID="insight-card" style={{ gap: theme.spacing.sm }}>
			<View style={styles.headerRow}>
				<Icon name="sparkles" size={20} color={theme.colors.brand} strokeWidth={1.7} />
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
						<Icon name="refresh" size={18} color={theme.colors.brand} />
					</Pressable>
				) : null}
			</View>

			{agg.documentedDays === 0 ? (
				<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
					{t("insight.empty")}
				</Text>
			) : needsConsent ? (
				<>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{tc("enableBody")}
					</Text>
					<PillButton
						label={tc("enableCta")}
						accessibilityLabel={tc("enableCta")}
						variant="secondary"
						onPress={() => setConsentOpen(true)}
						testID="insight-enable-ai"
					/>
				</>
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
			<AiConsentSheet
				visible={consentOpen}
				onClose={() => setConsentOpen(false)}
				onAccept={() => {
					setConsentOpen(false);
					run(true);
				}}
			/>
		</Card>
	);
}

const styles = StyleSheet.create({
	teaser: { flexDirection: "row", alignItems: "center", gap: 10 },
	headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
