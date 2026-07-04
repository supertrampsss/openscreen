import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { DraftSheet, PillButton } from "@/components/ui";
import { useTheme } from "@/theme";

interface Props {
	visible: boolean;
	onClose: () => void;
	/** « Saisir à la main » : bascule vers le repas manuel avec la photo. */
	onManual: () => void;
}

/**
 * Teaser Premium (§5.4.5) — placeholder Phase 6. Affiché quand le quota d'essai
 * de 10 photos est épuisé (429 trial_exhausted). Jamais de second flow d'achat,
 * jamais anxiogène : on explique et on propose la saisie manuelle (gratuite).
 */
export function PremiumTeaserSheet({ visible, onClose, onManual }: Props) {
	const { t } = useTranslation("scan");
	const theme = useTheme();

	return (
		<DraftSheet visible={visible} onClose={onClose} title={t("premium.title")}>
			<Text style={[theme.typography.body, { color: theme.colors.text }]}>{t("premium.body")}</Text>

			{/* Bouton Premium grisé — activé en Phase 6. */}
			<View
				testID="premium-see-disabled"
				style={[
					styles.disabledCta,
					{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.pill },
				]}
			>
				<Text style={[theme.typography.subheading, { color: theme.colors.textFaint }]}>
					{t("premium.see")}
				</Text>
				<View style={[styles.badge, { backgroundColor: theme.colors.border }]}>
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{t("premium.phase")}
					</Text>
				</View>
			</View>

			<PillButton
				label={t("premium.manual")}
				accessibilityLabel={t("premium.manual")}
				onPress={onManual}
				testID="premium-manual"
			/>
		</DraftSheet>
	);
}

const styles = StyleSheet.create({
	disabledCta: {
		minHeight: 52,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		opacity: 0.6,
	},
	badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
