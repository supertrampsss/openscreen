import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DataColorKey, ThemeColors } from "@/theme";
import { useTheme } from "@/theme";

/** Fond doux (pastille « tag ») associé à chaque teinte de donnée. */
const SOFT_KEY: Partial<Record<DataColorKey, keyof ThemeColors>> = {
	stool: "stoolSoft",
	meal: "mealSoft",
	pain: "painSoft",
	energy: "energySoft",
};

interface ChipTriggerProps {
	label: string;
	/** Niveau optionnel affiché en petit (ex. « FODMAP haut »). */
	level?: string;
	/** Teinte. Défaut : meal (#3B82F6). */
	tint?: DataColorKey;
	/** État sélectionné (multi-chips). */
	selected?: boolean;
	onPress?: () => void;
	accessibilityLabel?: string;
}

/** Pastille attribut déclencheur avec libellé + niveau (§3). */
export function ChipTrigger({
	label,
	level,
	tint = "meal",
	selected,
	onPress,
	accessibilityLabel,
}: ChipTriggerProps) {
	const theme = useTheme();
	const tintColor = theme.colors[tint];
	const softColor = theme.colors[SOFT_KEY[tint] ?? "surface"];
	const interactive = typeof onPress === "function";
	const isSelected = selected ?? true;

	// Pastille douce « tag » (fond *Soft, texte teinté) quand sélectionnée ou en
	// AFFICHAGE (non tapable). Chip INTERACTIF non sélectionné = hairline discret.
	const showSoft = !interactive || isSelected;
	const bg = showSoft ? softColor : theme.colors.surface;
	const border = interactive && !isSelected ? theme.colors.border : "transparent";
	const labelColor = showSoft ? tintColor : theme.colors.text;
	const levelColor = showSoft ? tintColor : theme.colors.textMuted;

	const content = (
		<View
			style={[
				styles.chip,
				{
					borderRadius: theme.radii.pill,
					backgroundColor: bg,
					borderColor: border,
					paddingHorizontal: theme.spacing.md,
				},
			]}
		>
			<Text
				style={[
					theme.typography.caption,
					{ color: labelColor, fontWeight: theme.fontWeight.medium },
				]}
			>
				{label}
			</Text>
			{level ? (
				<Text style={[theme.typography.caption, { color: levelColor }]}>{level}</Text>
			) : null}
		</View>
	);

	if (!interactive) {
		return content;
	}

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected: isSelected }}
			accessibilityLabel={accessibilityLabel ?? `${label}${level ? ` ${level}` : ""}`}
			onPress={onPress}
			style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
		>
			{content}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 34,
		borderWidth: StyleSheet.hairlineWidth,
	},
});
