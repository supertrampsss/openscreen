/**
 * Liste de choix verticale pleine largeur (§4) — un écran = une question.
 * Rangées cartes ≥56 px, hairline au repos, sélection = fond `brandSoft` +
 * bordure `brand` + coche `brand`. Mono-select (radiogroup) ou multi (checkboxes).
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { haptics } from "@/services/haptics";
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
	const reduceMotion = useReducedMotion();
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
						onPress={() => {
							haptics.selection();
							onToggle(opt.value);
						}}
						style={({ pressed }) => [
							styles.row,
							{
								borderRadius: theme.radii.md,
								backgroundColor: isSel ? theme.colors.brandSoft : theme.colors.card,
								borderColor: isSel ? theme.colors.brand : theme.colors.border,
								borderWidth: isSel ? 1.5 : StyleSheet.hairlineWidth,
								opacity: pressed ? 0.92 : 1,
								transform: pressed && !reduceMotion ? [{ scale: 0.99 }] : undefined,
							},
						]}
					>
						<Text
							style={[
								theme.typography.subheading,
								{ color: isSel ? theme.colors.brand : theme.colors.text, flex: 1 },
							]}
						>
							{opt.label}
						</Text>
						<View
							style={[
								styles.mark,
								multi ? styles.markSquare : styles.markRound,
								{
									backgroundColor: isSel ? theme.colors.brand : "transparent",
									borderColor: isSel ? theme.colors.brand : theme.colors.border,
								},
							]}
						>
							{isSel ? (
								<Icon name="check" size={15} color={theme.colors.card} strokeWidth={2.6} />
							) : null}
						</View>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		minHeight: 58,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 18,
		paddingVertical: 12,
	},
	mark: {
		width: 24,
		height: 24,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1.5,
	},
	markRound: { borderRadius: 999 },
	markSquare: { borderRadius: 8 },
});
