import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, PillButton } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import { BackupError } from "@/domain/backup";
import { useFlare } from "@/features/flare/FlareContext";
import { FlareToggle } from "@/features/flare/FlareToggle";
import { exportBackup, importBackup } from "@/services/backupService";
import { useTheme } from "@/theme";

export default function SettingsScreen() {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const snackbar = useSnackbar();
	const { flare } = useFlare();
	const [busy, setBusy] = useState(false);

	const doExport = async () => {
		setBusy(true);
		try {
			await exportBackup();
			snackbar.show({ message: t("settings.backupDone") });
		} catch {
			snackbar.show({ message: t("settings.backupError") });
		} finally {
			setBusy(false);
		}
	};

	const doImport = () => {
		Alert.alert(t("settings.restoreConfirmTitle"), t("settings.restoreConfirmBody"), [
			{ text: t("actions.cancel"), style: "cancel" },
			{
				text: t("actions.confirm"),
				style: "destructive",
				onPress: async () => {
					setBusy(true);
					try {
						const res = await importBackup();
						if (res.imported) {
							snackbar.show({ message: t("settings.restoreDone") });
						}
					} catch (err) {
						snackbar.show({
							message: err instanceof BackupError ? err.message : t("settings.restoreError"),
						});
					} finally {
						setBusy(false);
					}
				},
			},
		]);
	};

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
					{t("settings.title")}
				</Text>

				<View style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
						{t("flare.sectionTitle")}
					</Text>
					<Card style={{ gap: theme.spacing.md }}>
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("flare.sectionBody")}
						</Text>
						{flare.active && flare.since ? (
							<Text style={[theme.typography.caption, { color: theme.colors.pain }]}>
								{t("flare.since", { date: flare.since })}
							</Text>
						) : null}
						<FlareToggle />
					</Card>
				</View>

				<View style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
						{t("settings.dataSection")}
					</Text>
					<Card style={{ gap: theme.spacing.md }}>
						<PillButton
							label={t("settings.backup")}
							onPress={doExport}
							disabled={busy}
							accessibilityLabel={t("settings.backup")}
						/>
						<PillButton
							label={t("settings.restore")}
							variant="secondary"
							onPress={doImport}
							disabled={busy}
							accessibilityLabel={t("settings.restore")}
						/>
					</Card>
				</View>

				<Card>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{t("settings.privacyTitle")}
					</Text>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: 8 }]}>
						{t("settings.privacyBody")}
					</Text>
				</Card>

				<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
					{t("settings.disclaimer")}
				</Text>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
});
