import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DataColorKey } from "@/theme";
import { useTheme } from "@/theme";

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
	const interactive = typeof onPress === "function";
	const isSelected = selected ?? true;

	const content = (
		<View
			style={[
				styles.chip,
				{
					borderRadius: theme.radii.pill,
					backgroundColor: isSelected ? tintColor : theme.colors.surface,
					borderColor: isSelected ? tintColor : theme.colors.border,
					paddingHorizontal: theme.spacing.md,
				},
			]}
		>
			<Text
				style={[
					theme.typography.caption,
					{
						color: isSelected ? theme.colors.ctaText : theme.colors.text,
						fontWeight: theme.fontWeight.medium,
					},
				]}
			>
				{label}
			</Text>
			{level ? (
				<Text
					style={[
						theme.typography.caption,
						{ color: isSelected ? theme.colors.ctaText : theme.colors.textMuted },
					]}
				>
					{level}
				</Text>
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
