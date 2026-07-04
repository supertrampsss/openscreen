/**
 * Sélecteur d'année (§4.3) — liste déroulante « maison » des ~60 dernières
 * années, tap = sélection. Pas de dépendance de picker natif.
 */

import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useTheme } from "@/theme";

interface Props {
	value: number | null;
	onChange: (year: number) => void;
}

const SPAN = 60;

export function YearPicker({ value, onChange }: Props) {
	const theme = useTheme();
	const years = useMemo(() => {
		const now = new Date().getFullYear();
		return Array.from({ length: SPAN }, (_, i) => now - i);
	}, []);

	return (
		<ScrollView
			style={[styles.box, { borderColor: theme.colors.border, borderRadius: theme.radii.md }]}
			contentContainerStyle={{ padding: theme.spacing.xs }}
			showsVerticalScrollIndicator
		>
			{years.map((year) => {
				const selected = value === year;
				return (
					<Pressable
						key={year}
						accessibilityRole="radio"
						accessibilityState={{ selected }}
						accessibilityLabel={String(year)}
						testID={`year-${year}`}
						onPress={() => onChange(year)}
						style={[
							styles.row,
							{
								borderRadius: theme.radii.sm,
								backgroundColor: selected ? theme.colors.text : "transparent",
							},
						]}
					>
						<Text
							style={[
								theme.typography.subheading,
								{ color: selected ? theme.colors.ctaText : theme.colors.text, textAlign: "center" },
							]}
						>
							{year}
						</Text>
					</Pressable>
				);
			})}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	box: { maxHeight: 240, borderWidth: StyleSheet.hairlineWidth },
	row: { minHeight: 48, alignItems: "center", justifyContent: "center", marginVertical: 2 },
});
