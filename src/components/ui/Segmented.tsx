import { Pressable, StyleSheet, Text, View } from "react-native";
import { haptics } from "@/services/haptics";
import { useTheme } from "@/theme";

export interface SegmentedOption {
	value: string;
	label: string;
	/** testID → data-testid sur react-native-web (E2E). */
	testID?: string;
}

interface SegmentedProps {
	options: SegmentedOption[];
	/** Valeur contrôlée (doit correspondre à un `option.value`). */
	value: string;
	onChange: (value: string) => void;
	/** Libellé accessible du groupe entier. */
	accessibilityLabel?: string;
}

/**
 * Contrôle segmenté raffiné (« Clinique calme ») — remplace les bascules
 * rustiques type « 30 jours / 90 jours ». Piste `surface` en pilule ; le segment
 * actif est une pastille `card` surélevée (ombre douce), texte plein ; les
 * segments inactifs restent en texte discret. Cible tactile ≥48 (§3).
 */
export function Segmented({ options, value, onChange, accessibilityLabel }: SegmentedProps) {
	const theme = useTheme();

	return (
		<View
			accessibilityRole="tablist"
			accessibilityLabel={accessibilityLabel}
			style={[
				styles.track,
				{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.pill },
			]}
		>
			{options.map((opt) => {
				const selected = opt.value === value;
				return (
					<Pressable
						key={opt.value}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						accessibilityLabel={opt.label}
						testID={opt.testID}
						onPress={() => {
							haptics.selection();
							onChange(opt.value);
						}}
						style={({ pressed }) => [
							styles.segment,
							{
								borderRadius: theme.radii.pill,
								backgroundColor: selected ? theme.colors.card : "transparent",
								opacity: pressed && !selected ? 0.6 : 1,
							},
							selected ? theme.shadows.card : null,
						]}
					>
						<Text
							numberOfLines={1}
							style={[
								theme.typography.label,
								{
									color: selected ? theme.colors.text : theme.colors.textMuted,
									fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.medium,
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
	);
}

const styles = StyleSheet.create({
	track: {
		flexDirection: "row",
		alignItems: "stretch",
		padding: 4,
		gap: 4,
	},
	segment: {
		flex: 1,
		minHeight: 40,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "center",
	},
});
