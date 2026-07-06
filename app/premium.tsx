/**
 * Écran Premium (§8) — modal ouvert explicitement (teaser scan, Réglages,
 * écran 16 de l'onboarding y renvoie son propre rendu). Le paywall éthique
 * complet vit dans `PremiumPaywall` (réutilisé). AUCUNE relance : fermer ce
 * modal ne déclenche jamais de second flow.
 */

import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FadeInView } from "@/components/ui";
import { PremiumPaywall } from "@/features/premium/PremiumPaywall";
import { useTheme } from "@/theme";

export default function PremiumScreen() {
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();

	const close = () => {
		if (router.canGoBack()) router.back();
	};

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			<ScrollView
				contentContainerStyle={{
					padding: theme.spacing.lg,
					paddingTop: insets.top + theme.spacing.xl,
					paddingBottom: insets.bottom + theme.spacing.xl,
				}}
			>
				<FadeInView>
					<PremiumPaywall mode="modal" onClose={close} onPurchased={close} />
				</FadeInView>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
});
