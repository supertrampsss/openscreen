import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";

export interface WeekDay {
	/** local_date 'YYYY-MM-DD'. */
	date: string;
	/** Lettre du jour (L, M, M, J, V, S, D). */
	label: string;
	/** Numéro du jour du mois. */
	dayNumber: number;
	/** Le jour a-t-il au moins un log ? (pastille remplie). */
	documented: boolean;
	/** Aujourd'hui (rempli / mis en avant). */
	isToday: boolean;
}

interface WeekStripProps {
	days: WeekDay[];
	onSelectDay?: (date: string) => void;
	selectedDate?: string | null;
}

/** 7 pastilles jour, aujourd'hui rempli (§3, §5.1). */
export function WeekStrip({ days, onSelectDay, selectedDate }: WeekStripProps) {
	const theme = useTheme();

	return (
		<View style={[styles.row, { gap: theme.spacing.xs }]}>
			{days.map((day) => {
				const selected = selectedDate === day.date;
				const filled = day.isToday || day.documented;
				const bg = day.isToday
					? theme.colors.brand
					: day.documented
						? theme.colors.surface
						: "transparent";
				const numberColor = day.isToday
					? theme.colors.ctaText
					: day.documented
						? theme.colors.text
						: theme.colors.textFaint;
				return (
					<Pressable
						key={day.date}
						accessibilityRole="button"
						accessibilityState={{ selected }}
						accessibilityLabel={`${day.label} ${day.dayNumber}${day.documented ? ", documenté" : ""}`}
						onPress={() => onSelectDay?.(day.date)}
						style={styles.cell}
					>
						<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
							{day.label}
						</Text>
						<View
							style={[
								styles.dot,
								{
									backgroundColor: bg,
									borderColor: selected ? theme.colors.text : "transparent",
									borderWidth: selected ? 2 : 0,
								},
								filled
									? null
									: { borderColor: theme.colors.border, borderWidth: StyleSheet.hairlineWidth },
							]}
						>
							<Text style={[theme.typography.label, { color: numberColor }]}>{day.dayNumber}</Text>
						</View>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
	},
	cell: {
		flex: 1,
		alignItems: "center",
		gap: 6,
	},
	dot: {
		width: 38,
		height: 38,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
});
