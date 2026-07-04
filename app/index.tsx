import { StyleSheet, Text, View } from "react-native";

export default function Index() {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>Crohnicle</Text>
			<Text style={styles.subtitle}>Votre compagnon MICI, bientôt disponible.</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#F7F7F8",
		padding: 24,
	},
	title: {
		fontSize: 32,
		fontWeight: "700",
		color: "#0A0A0A",
	},
	subtitle: {
		marginTop: 8,
		fontSize: 16,
		color: "#4A4A4A",
		textAlign: "center",
	},
});
