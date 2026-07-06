/**
 * Wordmark — marque + nom « Crohnicle » (§2). Utilisé dans les barres de titre
 * (Accueil) et l'onboarding. Le nom vient de `@/constants/branding` (renommage
 * centralisé). Typo système en gras serré ; l'identité vient de la `LogoMark`.
 */

import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";
import { LogoMark } from "./LogoMark";

interface WordmarkProps {
	/** Taille de la marque (le texte suit). Défaut 26. */
	size?: number;
	/** Masquer le texte (marque seule). */
	markOnly?: boolean;
}

export function Wordmark({ size = 26, markOnly = false }: WordmarkProps) {
	const theme = useTheme();
	const { t } = useTranslation("common");
	return (
		<View style={styles.row} accessibilityRole="header">
			<LogoMark size={size} />
			{markOnly ? null : (
				<Text
					style={[
						theme.typography.title,
						{ color: theme.colors.text, fontSize: size * 0.86, letterSpacing: -0.6 },
					]}
				>
					{t("appName")}
				</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
