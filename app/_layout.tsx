import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { db } from "@/db/client";
import migrations from "../drizzle/migrations";

export default function RootLayout() {
	const { success, error } = useMigrations(db, migrations);

	if (error) {
		return (
			<View style={styles.center}>
				<Text style={styles.title}>Préparation impossible</Text>
				<Text style={styles.subtitle}>Redémarrez l'application. Vos données sont intactes.</Text>
			</View>
		);
	}

	if (!success) {
		return (
			<View style={styles.center}>
				<ActivityIndicator color="#8B5CF6" />
				<Text style={styles.subtitle}>Préparation de votre journal…</Text>
			</View>
		);
	}

	return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#F7F7F8",
		padding: 24,
		gap: 12,
	},
	title: {
		fontSize: 20,
		fontWeight: "600",
		color: "#0A0A0A",
	},
	subtitle: {
		fontSize: 15,
		color: "#6B6B70",
		textAlign: "center",
	},
});
