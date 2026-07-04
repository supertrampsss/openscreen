import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { db, warmupDb } from "@/db/client";
import { seedFoods } from "@/db/seedFoods";
import { FlareProvider } from "@/features/flare/FlareContext";
import { OnboardingGate } from "@/features/onboarding/OnboardingGate";
import { initI18n } from "@/i18n";
import { initNotifications } from "@/services/notificationService";
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

/** Exécute les migrations puis rend l'app. Monté SEULEMENT une fois la DB chaude. */
function Migrator() {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const { success, error } = useMigrations(db, migrations);

	// Seed d'aliments FR (§5.5) : idempotent & versionné, joué UNE fois les
	// migrations appliquées. Un échec de seed ne bloque jamais l'app (best-effort).
	useEffect(() => {
		if (success) {
			seedFoods().catch(() => undefined);
			// Notifications locales (§7) : init une fois les migrations passées.
			// No-op propre sur web (module natif chargé dynamiquement).
			initNotifications().catch(() => undefined);
		}
	}, [success]);

	if (error) {
		return <LoadingScreen error message="Redémarrez l'application. Vos données sont intactes." />;
	}
	if (!success) {
		return <LoadingScreen message={t("loading")} />;
	}

	return (
		<FlareProvider>
			<SnackbarProvider>
				<OnboardingGate>
					<StatusBar style={theme.isDark ? "light" : "dark"} />
					<Stack
						screenOptions={{
							headerShown: false,
							contentStyle: { backgroundColor: theme.colors.background },
						}}
					>
						<Stack.Screen name="(tabs)" />
						{/* Onboarding (§4) : funnel plein écran, gestes de retour désactivés. */}
						<Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
						{/* Export médecin : écran poussé plein écran (modal). */}
						<Stack.Screen name="export" options={{ presentation: "modal" }} />
						{/* Premium (§8) : paywall éthique en modal. */}
						<Stack.Screen name="premium" options={{ presentation: "modal" }} />
					</Stack>
				</OnboardingGate>
			</SnackbarProvider>
		</FlareProvider>
	);
}

function Root() {
	const { t } = useTranslation("common");
	// Préchauffe le worker SQLite web AVANT toute requête sync (migrations incluses),
	// sinon le 1er appel sync « timeout » et fait planter l'app. No-op sur natif.
	const [warm, setWarm] = useState(false);
	const [warmError, setWarmError] = useState(false);
	useEffect(() => {
		let alive = true;
		warmupDb().then(
			() => {
				if (alive) setWarm(true);
			},
			() => {
				if (alive) setWarmError(true);
			},
		);
		return () => {
			alive = false;
		};
	}, []);

	if (warmError) {
		return <LoadingScreen error message="Redémarrez l'application. Vos données sont intactes." />;
	}
	if (!warm) {
		return <LoadingScreen message={t("loading")} />;
	}
	return <Migrator />;
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
