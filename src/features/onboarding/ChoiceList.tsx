/**
 * Liste de choix verticale pleine largeur (§4) — un écran = une question,
 * gros boutons ≥56 px. Mono-select (radiogroup) ou multi-select (checkboxes).
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";

export interface Choice {
	value: string;
	label: string;
	testID?: string;
}

interface Props {
	options: Choice[];
	/** Valeurs sélectionnées (une seule en mono-select). */
	selected: string[];
	onToggle: (value: string) => void;
	multi?: boolean;
}

export function ChoiceList({ options, selected, onToggle, multi = false }: Props) {
	const theme = useTheme();
	return (
		<View accessibilityRole={multi ? undefined : "radiogroup"} style={{ gap: theme.spacing.sm }}>
			{options.map((opt) => {
				const isSel = selected.includes(opt.value);
				return (
					<Pressable
						key={opt.value}
						accessibilityRole={multi ? "checkbox" : "radio"}
						accessibilityState={multi ? { checked: isSel } : { selected: isSel }}
						accessibilityLabel={opt.label}
						testID={opt.testID}
						onPress={() => onToggle(opt.value)}
						style={({ pressed }) => [
							styles.row,
							{
								borderRadius: theme.radii.md,
								backgroundColor: isSel ? theme.colors.text : theme.colors.card,
								borderColor: isSel ? theme.colors.text : theme.colors.border,
								opacity: pressed ? 0.9 : 1,
							},
						]}
					>
						<Text
							style={[
								theme.typography.subheading,
								{ color: isSel ? theme.colors.ctaText : theme.colors.text, flex: 1 },
							]}
						>
							{opt.label}
						</Text>
						{isSel ? (
							<Text style={[theme.typography.subheading, { color: theme.colors.ctaText }]}>✓</Text>
						) : null}
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		minHeight: 56,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 18,
		paddingVertical: 12,
		borderWidth: StyleSheet.hairlineWidth,
	},
});
