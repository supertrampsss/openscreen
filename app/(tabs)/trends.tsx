import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "@/components/ui";
import { useTheme } from "@/theme";

export default function TrendsScreen() {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const insets = useSafeAreaInsets();

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			<ScrollView
				contentContainerStyle={{
					padding: theme.spacing.lg,
					paddingTop: insets.top + theme.spacing.md,
					gap: theme.spacing.lg,
				}}
			>
				<Text style={[theme.typography.title, { color: theme.colors.text }]}>
					{t("trends.title")}
				</Text>
				<Card>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{t("trends.soon")}
					</Text>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: 8 }]}>
						{t("trends.soonHint")}
					</Text>
				</Card>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
});
