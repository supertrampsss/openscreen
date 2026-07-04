import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DraftSheet } from "@/components/ui";
import { useTheme } from "@/theme";

export type AddAction = "stool" | "symptom";

interface AddSheetProps {
	visible: boolean;
	onClose: () => void;
	onPick: (action: AddAction) => void;
}

interface Row {
	emoji: string;
	labelKey: string;
	action?: AddAction;
	badgeKey?: string;
}

const ROWS: Row[] = [
	{ emoji: "💩", labelKey: "addMenu.stool", action: "stool" },
	{ emoji: "🤕", labelKey: "addMenu.symptoms", action: "symptom" },
	{ emoji: "🍽️", labelKey: "addMenu.mealManual", badgeKey: "addMenu.pr4" },
	{ emoji: "📸", labelKey: "addMenu.photo", badgeKey: "addMenu.pr5" },
	{ emoji: "🎙️", labelKey: "addMenu.voice", badgeKey: "addMenu.soon" },
];

/** Bottom-sheet des 5 actions du bouton « + » (§5.1). */
export function AddSheet({ visible, onClose, onPick }: AddSheetProps) {
	const { t } = useTranslation("log");
	const theme = useTheme();

	return (
		<DraftSheet visible={visible} onClose={onClose} title={t("addMenu.title")}>
			<View style={{ gap: theme.spacing.sm }}>
				{ROWS.map((row) => {
					const disabled = !row.action;
					return (
						<Pressable
							key={row.labelKey}
							accessibilityRole="button"
							accessibilityState={{ disabled }}
							accessibilityLabel={t(row.labelKey)}
							testID={row.action ? `add-action-${row.action}` : undefined}
							disabled={disabled}
							onPress={() => {
								if (row.action) onPick(row.action);
							}}
							style={[
								styles.row,
								{
									borderRadius: theme.radii.md,
									backgroundColor: theme.colors.surface,
									opacity: disabled ? 0.45 : 1,
								},
							]}
						>
							<Text style={styles.emoji}>{row.emoji}</Text>
							<Text
								style={[theme.typography.subheading, styles.label, { color: theme.colors.text }]}
							>
								{t(row.labelKey)}
							</Text>
							{row.badgeKey ? (
								<View style={[styles.badge, { backgroundColor: theme.colors.border }]}>
									<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
										{t(row.badgeKey)}
									</Text>
								</View>
							) : null}
						</Pressable>
					);
				})}
			</View>
		</DraftSheet>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		paddingHorizontal: 16,
		minHeight: 60,
	},
	emoji: {
		fontSize: 24,
	},
	label: {
		flex: 1,
	},
	badge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
	},
});
