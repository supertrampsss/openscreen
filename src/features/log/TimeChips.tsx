import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type EntryTimestamp, formatClock, shiftMinutes } from "@/domain/dates";
import { useTheme } from "@/theme";

export type TimeMode = "now" | "m15" | "m1h" | "custom";

interface TimeChipsProps {
	/** Instant « maintenant » figé à l'ouverture du sheet. */
	base: EntryTimestamp;
	mode: TimeMode;
	value: EntryTimestamp;
	onChange: (mode: TimeMode, value: EntryTimestamp) => void;
}

/**
 * Chips d'heure (§5.2) : Maintenant (défaut) / −15 min / −1 h / Autre.
 * « Autre » révèle un ajusteur ±15 min (pas de picker natif — web-safe).
 */
export function TimeChips({ base, mode, value, onChange }: TimeChipsProps) {
	const { t } = useTranslation("common");
	const theme = useTheme();

	const chips: { key: TimeMode; label: string; ts: EntryTimestamp }[] = [
		{ key: "now", label: t("time.now"), ts: base },
		{ key: "m15", label: t("time.minus15"), ts: shiftMinutes(base, -15) },
		{ key: "m1h", label: t("time.minus1h"), ts: shiftMinutes(base, -60) },
		{ key: "custom", label: t("time.other"), ts: value },
	];

	return (
		<View style={{ gap: theme.spacing.sm }}>
			<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
				{formatClock(value.epochMs, value.tz)}
			</Text>
			<View style={[styles.row, { gap: theme.spacing.sm }]}>
				{chips.map((chip) => {
					const selected = mode === chip.key;
					return (
						<Pressable
							key={chip.key}
							accessibilityRole="radio"
							accessibilityState={{ selected }}
							accessibilityLabel={chip.label}
							onPress={() => onChange(chip.key, chip.ts)}
							style={({ pressed }) => [
								styles.chip,
								{
									borderRadius: theme.radii.pill,
									backgroundColor: selected ? theme.colors.text : theme.colors.surface,
									borderColor: selected ? theme.colors.text : theme.colors.border,
									opacity: pressed && !selected ? 0.7 : 1,
								},
							]}
						>
							<Text
								style={[
									theme.typography.label,
									{ color: selected ? theme.colors.background : theme.colors.text },
								]}
							>
								{chip.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
			{mode === "custom" ? (
				<View style={[styles.row, { gap: theme.spacing.sm }]}>
					<Stepper label="−15 min" onPress={() => onChange("custom", shiftMinutes(value, -15))} />
					<Stepper label="+15 min" onPress={() => onChange("custom", shiftMinutes(value, 15))} />
				</View>
			) : null}
		</View>
	);
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
	const theme = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			style={({ pressed }) => [
				styles.stepper,
				{
					borderRadius: theme.radii.md,
					backgroundColor: pressed ? theme.colors.border : theme.colors.surface,
					borderColor: theme.colors.border,
				},
			]}
		>
			<Text style={[theme.typography.label, { color: theme.colors.text }]}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		flexWrap: "wrap",
	},
	chip: {
		minHeight: 40,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: StyleSheet.hairlineWidth,
	},
	stepper: {
		flex: 1,
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: StyleSheet.hairlineWidth,
	},
});
