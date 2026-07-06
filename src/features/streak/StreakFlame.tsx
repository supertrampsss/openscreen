/**
 * Flamme de streak (§5.1, §7) — top bar Home.
 *
 * Affiche la série « jours documentés ». Gelée en poussée → flamme grisée + flocon.
 * Tap → petit sheet explicatif, copy bienveillant orienté dossier médical (§7),
 * jamais culpabilisant.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { DraftSheet } from "@/components/ui";
import type { StreakResult } from "@/domain/streak";
import { useTheme } from "@/theme";

export function StreakFlame({ streak }: { streak: StreakResult | null }) {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const [open, setOpen] = useState(false);

	const count = streak?.current ?? 0;
	const frozen = streak?.frozen ?? false;

	return (
		<>
			<Pressable
				testID="streak-flame"
				accessibilityRole="button"
				accessibilityLabel={t("streak.flameLabel", { count })}
				onPress={() => setOpen(true)}
				hitSlop={8}
				style={[
					styles.chip,
					{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.pill },
				]}
			>
				<Icon
					name={frozen ? "snowflake" : "flame"}
					size={17}
					color={frozen ? theme.colors.textFaint : theme.colors.pain}
					strokeWidth={1.9}
				/>
				<Text
					style={[
						theme.typography.subheading,
						{ color: frozen ? theme.colors.textMuted : theme.colors.text },
					]}
				>
					{count}
				</Text>
			</Pressable>

			<DraftSheet visible={open} onClose={() => setOpen(false)} title={t("streak.sheetTitle")}>
				<View style={{ gap: theme.spacing.md }}>
					<Text style={[theme.typography.dataLg, { color: theme.colors.text }]}>
						{t("streak.count", { count })}
					</Text>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{count > 0 ? t("streak.body") : t("streak.zero")}
					</Text>
					{frozen ? (
						<Text style={[theme.typography.body, { color: theme.colors.pain }]}>
							{t("streak.frozen")}
						</Text>
					) : (
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{streak?.graceUsedThisWeek ? t("streak.graceUsed") : t("streak.graceAvailable")}
						</Text>
					)}
					{streak && streak.longest > 0 ? (
						<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
							{t("streak.longest", { count: streak.longest })}
						</Text>
					) : null}
				</View>
			</DraftSheet>
		</>
	);
}

const styles = StyleSheet.create({
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 6,
		minHeight: 40,
	},
});
