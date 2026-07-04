/**
 * Carte d'urgence toilettes (§5.10, §5.12) — placeholder « Bientôt » (Phase 8).
 * Accessible via `crohnicle://urgence` et la quick action « Carte urgence ».
 */

import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PillButton } from "@/components/ui";
import { useTheme } from "@/theme";

export default function UrgenceScreen() {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();

	const close = () => {
		if (router.canGoBack()) router.back();
		else router.replace("/(tabs)");
	};

	return (
		<View
			style={[
				styles.flex,
				{
					backgroundColor: theme.colors.background,
					paddingTop: insets.top + theme.spacing.xl,
					paddingBottom: insets.bottom + theme.spacing.xl,
				},
			]}
		>
			<View style={styles.body}>
				<Text style={styles.emoji}>🚻</Text>
				<Text style={[theme.typography.title, styles.center, { color: theme.colors.text }]}>
					{t("urgence.title")}
				</Text>
				<Text style={[theme.typography.body, styles.center, { color: theme.colors.textMuted }]}>
					{t("urgence.body")}
				</Text>
				<View style={[styles.badge, { backgroundColor: theme.colors.surface }]}>
					<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
						{t("urgence.soon")}
					</Text>
				</View>
			</View>
			<View style={styles.footer}>
				<PillButton
					label={t("urgence.back")}
					accessibilityLabel={t("urgence.back")}
					onPress={close}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1, paddingHorizontal: 20 },
	body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
	emoji: { fontSize: 64 },
	center: { textAlign: "center" },
	badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
	footer: { paddingTop: 12 },
});
