import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { DraftSheet, PillButton } from "@/components/ui";
import { PRIVACY_URL } from "@/constants/branding";
import { setAiConsent } from "@/services/aiConsent";
import { useTheme } from "@/theme";

interface Props {
	visible: boolean;
	/** Fermeture sans accepter (scrim, retour matériel, « Annuler »). */
	onClose: () => void;
	/** Consentement accordé + persisté : l'appelant poursuit le flux IA. */
	onAccept: () => void;
}

/**
 * Feuille de consentement à l'analyse par IA tierce (§2 loi 4, App Store §5.1.2).
 *
 * Affichée AVANT le premier envoi (photo, note vocale ou bilan hebdo). Un seul
 * consentement couvre les trois flux : le texte les nomme explicitement.
 * « Accepter et continuer » persiste `ai_consent=1` puis poursuit le scan ;
 * « Annuler » ferme sans rien envoyer. Un lien ouvre la politique de confidentialité.
 */
export function AiConsentSheet({ visible, onClose, onAccept }: Props) {
	const { t } = useTranslation("aiConsent");
	const theme = useTheme();
	const [busy, setBusy] = useState(false);

	const accept = useCallback(async () => {
		if (busy) return;
		setBusy(true);
		try {
			await setAiConsent(true);
			onAccept();
		} finally {
			setBusy(false);
		}
	}, [busy, onAccept]);

	const openPrivacy = useCallback(() => {
		Linking.openURL(PRIVACY_URL).catch(() => undefined);
	}, []);

	return (
		<DraftSheet visible={visible} onClose={onClose} title={t("title")}>
			<Text style={[theme.typography.body, { color: theme.colors.text }]}>{t("body")}</Text>

			<Pressable
				accessibilityRole="link"
				accessibilityLabel={t("privacyLink")}
				testID="ai-consent-privacy-link"
				onPress={openPrivacy}
				hitSlop={6}
			>
				<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
					{t("privacyLink")}
				</Text>
			</Pressable>

			<PillButton
				label={t("accept")}
				accessibilityLabel={t("accept")}
				onPress={accept}
				loading={busy}
				testID="ai-consent-accept"
			/>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("cancel")}
				testID="ai-consent-cancel"
				onPress={onClose}
				disabled={busy}
				style={styles.cancel}
			>
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
					{t("cancel")}
				</Text>
			</Pressable>
		</DraftSheet>
	);
}

const styles = StyleSheet.create({
	cancel: { alignItems: "center", paddingVertical: 8 },
});
