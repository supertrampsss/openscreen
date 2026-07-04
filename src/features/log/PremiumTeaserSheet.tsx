import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import { DraftSheet, PillButton } from "@/components/ui";
import { useTheme } from "@/theme";

interface Props {
	visible: boolean;
	onClose: () => void;
	/** « Saisir à la main » : bascule vers le repas manuel avec la photo. */
	onManual: () => void;
}

/**
 * Teaser Premium (§5.4.5) — affiché quand le quota d'essai de 10 photos est
 * épuisé (429 trial_exhausted). Jamais de second flow d'achat, jamais anxiogène :
 * on explique, on propose la saisie manuelle (gratuite), et « Voir Premium »
 * ouvre le paywall éthique (§8) — jamais imposé.
 */
export function PremiumTeaserSheet({ visible, onClose, onManual }: Props) {
	const { t } = useTranslation("scan");
	const theme = useTheme();
	const router = useRouter();

	const seePremium = () => {
		onClose();
		router.push("/premium");
	};

	return (
		<DraftSheet visible={visible} onClose={onClose} title={t("premium.title")}>
			<Text style={[theme.typography.body, { color: theme.colors.text }]}>{t("premium.body")}</Text>

			<PillButton
				label={t("premium.see")}
				accessibilityLabel={t("premium.see")}
				onPress={seePremium}
				testID="premium-see"
			/>
			<PillButton
				label={t("premium.manual")}
				accessibilityLabel={t("premium.manual")}
				variant="secondary"
				onPress={onManual}
				testID="premium-manual"
			/>
		</DraftSheet>
	);
}
