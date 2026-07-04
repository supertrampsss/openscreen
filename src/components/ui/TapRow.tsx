import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DataColorKey } from "@/theme";
import { useTheme } from "@/theme";

export interface TapOption<T> {
	value: T;
	label: string;
	/** Libellé long pour l'accessibilité (sinon `label`). */
	accessibilityLabel?: string;
	/** testID → data-testid sur react-native-web (E2E). */
	testID?: string;
}

interface TapRowProps<T> {
	options: TapOption<T>[];
	/** Valeur contrôlée. `null` = aucune sélection. */
	value: T | null;
	onChange: (value: T) => void;
	/** Titre optionnel de la rangée. */
	title?: string;
	/** Teinte de la sélection (clé de donnée). Défaut : neutre (texte). */
	tint?: DataColorKey;
	/** Libellé accessible du groupe entier. */
	accessibilityLabel?: string;
}

/**
 * Rangée générique de boutons de sélection un-tap, single-select, contrôlée.
 * Gros hit targets ≥48 px, accessibilityRole="radiogroup" (§3).
 */
export function TapRow<T extends string | number>({
	options,
	value,
	onChange,
	title,
	tint,
	accessibilityLabel,
}: TapRowProps<T>) {
	const theme = useTheme();
	const tintColor = useMemo(
		() => (tint ? theme.colors[tint] : theme.colors.text),
		[tint, theme.colors],
	);

	return (
		<View
			accessibilityRole="radiogroup"
			accessibilityLabel={accessibilityLabel ?? title}
			style={styles.wrapper}
		>
			{title ? (
				<Text style={[theme.typography.label, styles.title, { color: theme.colors.textMuted }]}>
					{title}
				</Text>
			) : null}
			<View style={[styles.row, { gap: theme.spacing.sm }]}>
				{options.map((opt) => {
					const selected = value === opt.value;
					return (
						<Pressable
							key={String(opt.value)}
							accessibilityRole="radio"
							accessibilityState={{ selected }}
							accessibilityLabel={opt.accessibilityLabel ?? opt.label}
							testID={opt.testID}
							onPress={() => onChange(opt.value)}
							style={({ pressed }) => [
								styles.cell,
								{
									borderRadius: theme.radii.md,
									backgroundColor: selected ? tintColor : theme.colors.surface,
									borderColor: selected ? tintColor : theme.colors.border,
									opacity: pressed ? 0.85 : 1,
								},
							]}
						>
							<Text
								style={[
									theme.typography.label,
									{
										color: selected ? theme.colors.ctaText : theme.colors.text,
										textAlign: "center",
									},
								]}
							>
								{opt.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		width: "100%",
	},
	title: {
		marginBottom: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "stretch",
	},
	cell: {
		flex: 1,
		minHeight: 48,
		paddingHorizontal: 8,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: StyleSheet.hairlineWidth,
	},
});
