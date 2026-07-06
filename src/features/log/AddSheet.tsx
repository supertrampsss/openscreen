import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { DraftSheet } from "@/components/ui";
import type { ThemeColors } from "@/theme";
import { useTheme } from "@/theme";

export type AddAction = "stool" | "symptom" | "meal" | "photo" | "voice";

interface AddSheetProps {
	visible: boolean;
	onClose: () => void;
	onPick: (action: AddAction) => void;
}

interface Row {
	icon: IconName;
	/** Teinte de la pastille d'avatar (couleur pleine + fond *Soft). */
	tint: keyof ThemeColors;
	soft: keyof ThemeColors;
	labelKey: string;
	action?: AddAction;
	badgeKey?: string;
}

const ROWS: Row[] = [
	{ icon: "camera", tint: "brand", soft: "brandSoft", labelKey: "addMenu.photo", action: "photo" },
	{ icon: "stool", tint: "stool", soft: "stoolSoft", labelKey: "addMenu.stool", action: "stool" },
	{
		icon: "pulse",
		tint: "pain",
		soft: "painSoft",
		labelKey: "addMenu.symptoms",
		action: "symptom",
	},
	{
		icon: "utensils",
		tint: "meal",
		soft: "mealSoft",
		labelKey: "addMenu.mealManual",
		action: "meal",
	},
	{ icon: "mic", tint: "brand", soft: "brandSoft", labelKey: "addMenu.voice", action: "voice" },
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
							style={({ pressed }) => [
								styles.row,
								{
									borderRadius: theme.radii.lg,
									backgroundColor: pressed ? theme.colors.border : theme.colors.surface,
									borderColor: theme.colors.border,
									opacity: disabled ? 0.45 : 1,
								},
							]}
						>
							<View style={[styles.avatar, { backgroundColor: theme.colors[row.soft] }]}>
								<Icon name={row.icon} size={22} color={theme.colors[row.tint]} strokeWidth={1.8} />
							</View>
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
							) : (
								<Icon
									name="chevronRight"
									size={18}
									color={theme.colors.textFaint}
									strokeWidth={1.8}
								/>
							)}
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
		minHeight: 64,
		borderWidth: StyleSheet.hairlineWidth,
	},
	avatar: {
		width: 42,
		height: 42,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
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
