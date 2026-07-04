import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { ChipTrigger } from "@/components/ui";
import { activeTriggerKeys, type FoodTriggers } from "@/domain/foods";
import type { MealItemView } from "@/repositories/mealRepo";
import { useTheme } from "@/theme";

/** Agrège les attributs déclencheurs actifs (union) d'une liste d'items. */
export function aggregateTriggers(items: { triggers: FoodTriggers }[]): string[] {
	const set = new Set<string>();
	for (const item of items) {
		for (const key of activeTriggerKeys(item.triggers)) set.add(key);
	}
	return [...set];
}

interface MealTriggerChipsProps {
	items: MealItemView[];
	/** Nb max de chips avant le résumé « +N ». Défaut 3 (§ Home/Journal). */
	max?: number;
}

/** Chips triggers agrégées d'un repas (max N + « +N »), teinte repas (bleu). */
export function MealTriggerChips({ items, max = 3 }: MealTriggerChipsProps) {
	const { t } = useTranslation("log");
	const theme = useTheme();
	const keys = aggregateTriggers(items);
	if (keys.length === 0) return null;

	const shown = keys.slice(0, max);
	const extra = keys.length - shown.length;

	return (
		<View style={styles.wrap} testID="meal-trigger-chips">
			{shown.map((key) => (
				<ChipTrigger key={key} label={t(`triggers.${key}`)} tint="meal" />
			))}
			{extra > 0 ? (
				<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
					{t("meal.moreTriggers", { count: extra })}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
});
