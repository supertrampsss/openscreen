import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { db } from "@/db/client";
import { initI18n } from "@/i18n";
import { ThemeProvider, useTheme } from "@/theme";
import migrations from "../drizzle/migrations";

// Initialise i18n au chargement du module (avant tout rendu).
initI18n();

function LoadingScreen({ message, error }: { message: string; error?: boolean }) {
	const theme = useTheme();
	return (
		<View style={[styles.center, { backgroundColor: theme.colors.background }]}>
			{error ? null : <ActivityIndicator color={theme.colors.stool} />}
			<Text style={[theme.typography.body, { color: theme.colors.textMuted, textAlign: "center" }]}>
				{message}
			</Text>
		</View>
	);
}

function Root() {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const { success, error } = useMigrations(db, migrations);

	if (error) {
		return <LoadingScreen error message="Redémarrez l'application. Vos données sont intactes." />;
	}
	if (!success) {
		return <LoadingScreen message={t("loading")} />;
	}

	return (
		<SnackbarProvider>
			<StatusBar style={theme.isDark ? "light" : "dark"} />
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: theme.colors.background },
				}}
			/>
		</SnackbarProvider>
	);
}

export default function RootLayout() {
	return (
		<GestureHandlerRootView style={styles.flex}>
			<SafeAreaProvider>
				<ThemeProvider>
					<Root />
				</ThemeProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 24,
		gap: 12,
	},
});
