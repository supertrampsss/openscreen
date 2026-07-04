/**
 * Carte d'Urgence numérique (§5.10) — 100 % offline, plein écran, contraste MAX.
 *
 * SEULE exception autorisée au design system (§3) : fond noir, texte blanc énorme,
 * priorité absolue à la lisibilité pour la montrer à un tiers. Les 5 messages sont
 * EN DUR (`src/data/urgencyCard.ts`), indépendants de la langue de l'app : un
 * francophone doit pouvoir la présenter en allemand à l'étranger.
 *
 * Accessible via `crohnicle://urgence` (deep-link), la quick action « Carte
 * urgence » et le gros bouton de l'onglet Urgence.
 */

import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	URGENCY_LANG_LABEL,
	URGENCY_LANGS,
	URGENCY_MESSAGE,
	type UrgencyLang,
} from "@/data/urgencyCard";
import i18n from "@/i18n";

/** Langue de départ = langue de l'app si elle est couverte, sinon FR. */
function initialLang(): UrgencyLang {
	const code = i18n.language?.slice(0, 2) as UrgencyLang;
	return URGENCY_LANGS.includes(code) ? code : "fr";
}

export default function UrgenceScreen() {
	const { t } = useTranslation("urgence");
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const [lang, setLang] = useState<UrgencyLang>(initialLang);

	const close = () => {
		if (router.canGoBack()) router.back();
		else router.replace("/(tabs)");
	};

	return (
		<View
			testID="urgence-card"
			style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
		>
			{/* Retour discret. */}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("card.back")}
				testID="urgence-back"
				onPress={close}
				hitSlop={16}
				style={styles.back}
			>
				<Text style={styles.backText}>‹ {t("card.back")}</Text>
			</Pressable>

			<ScrollView
				contentContainerStyle={styles.body}
				showsVerticalScrollIndicator={false}
				centerContent
			>
				<Text testID="urgence-message" style={styles.message} accessibilityRole="text">
					{URGENCY_MESSAGE[lang]}
				</Text>
			</ScrollView>

			<Text style={styles.hint}>{t("card.hint")}</Text>

			{/* Sélecteur de langue (chips) — 5 langues en dur. */}
			<View style={styles.langRow}>
				{URGENCY_LANGS.map((l) => {
					const selected = l === lang;
					return (
						<Pressable
							key={l}
							accessibilityRole="button"
							accessibilityState={{ selected }}
							accessibilityLabel={URGENCY_LANG_LABEL[l]}
							testID={`urgence-lang-${l}`}
							onPress={() => setLang(l)}
							style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
						>
							<Text style={[styles.chipText, selected ? styles.chipTextOn : styles.chipTextOff]}>
								{URGENCY_LANG_LABEL[l]}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

// Couleurs EN DUR (exception design §3) : contraste maximal, indépendant du thème.
const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: "#000000", paddingHorizontal: 20 },
	back: { alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 4 },
	backText: { color: "#8A8A8E", fontSize: 17 },
	body: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
	message: {
		color: "#FFFFFF",
		fontSize: 34,
		lineHeight: 44,
		fontWeight: "800",
		textAlign: "center",
	},
	hint: { color: "#8A8A8E", fontSize: 14, textAlign: "center", marginBottom: 12 },
	langRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 10 },
	chip: {
		minWidth: 56,
		minHeight: 48,
		paddingHorizontal: 16,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
	},
	chipOn: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
	chipOff: { backgroundColor: "#000000", borderColor: "#48484A" },
	chipText: { fontSize: 18, fontWeight: "700" },
	chipTextOn: { color: "#000000" },
	chipTextOff: { color: "#FFFFFF" },
});
