import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Card, PillButton } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import { PRIVACY_URL, TERMS_URL } from "@/constants/branding";
import { BackupError } from "@/domain/backup";
import { useFlare } from "@/features/flare/FlareContext";
import { FlareToggle } from "@/features/flare/FlareToggle";
import { NotificationsSettings } from "@/features/notifications/NotificationsSettings";
import { useOnboarding } from "@/features/onboarding/OnboardingGate";
import { exportBackup, importBackup } from "@/services/backupService";
import { devToggleMockPremium, useEntitlements } from "@/services/entitlements";
import { useTheme } from "@/theme";

/** Nombre de long-press sur la version qui bascule le Premium simulé (dev). */
const DEV_TOGGLE_TAPS = 5;

export default function SettingsScreen() {
	const { t } = useTranslation("common");
	const { t: tx } = useTranslation("export");
	const { t: tp } = useTranslation("premium");
	const { t: ttr } = useTranslation("treatments");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const snackbar = useSnackbar();
	const { flare } = useFlare();
	const { replay } = useOnboarding();
	const { status: entitlement, reload: reloadEntitlement } = useEntitlements();
	const [busy, setBusy] = useState(false);
	const devTaps = useRef(0);

	const appVersion = Constants.expoConfig?.version ?? "1.0.0";

	// Interrupteur caché (§11-bis) : long-press ×5 sur la version bascule le
	// Premium simulé, pour tester l'app dans les deux états sans compte store.
	const onVersionLongPress = async () => {
		devTaps.current += 1;
		if (devTaps.current < DEV_TOGGLE_TAPS) return;
		devTaps.current = 0;
		const on = await devToggleMockPremium();
		reloadEntitlement();
		snackbar.show({ message: on ? tp("toasts.mockOn") : tp("toasts.mockOff") });
	};

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

				{/* Traitements (§5.9) : rappels biothérapie, observance, effets secondaires. */}
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={ttr("settingsCard.title")}
					testID="settings-treatments"
					onPress={() => router.push("/treatments")}
				>
					<Card style={styles.premiumRow}>
						<View style={[styles.rowIcon, { backgroundColor: theme.colors.brandSoft }]}>
							<Icon name="capsule" size={22} color={theme.colors.brand} strokeWidth={1.8} />
						</View>
						<View style={styles.premiumBody}>
							<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
								{ttr("settingsCard.title")}
							</Text>
							<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
								{ttr("settingsCard.body")}
							</Text>
						</View>
						<Icon name="chevronRight" size={20} color={theme.colors.textFaint} />
					</Card>
				</Pressable>

				{/* Carte mise en avant : export médecin (§5.8, gratuit à vie). */}
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={tx("card.settingsTitle")}
					testID="settings-export"
					onPress={() => router.push("/export")}
				>
					<Card style={[styles.exportCard, { backgroundColor: theme.colors.text }]}>
						<Icon name="stethoscope" size={26} color={theme.colors.background} strokeWidth={1.8} />
						<View style={styles.exportBody}>
							<Text style={[theme.typography.subheading, { color: theme.colors.background }]}>
								{tx("card.settingsTitle")}
							</Text>
							<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
								{tx("card.settingsBody")}
							</Text>
						</View>
						<Icon name="chevronRight" size={20} color={theme.colors.background} />
					</Card>
				</Pressable>

				{/* Crohnicle Premium (§8) : statut + accès au paywall éthique. */}
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={tp("settingsRow")}
					testID="settings-premium"
					onPress={() => router.push("/premium")}
				>
					<Card style={styles.premiumRow}>
						<View style={[styles.rowIcon, { backgroundColor: theme.colors.brandSoft }]}>
							<Icon name="sparkles" size={22} color={theme.colors.brand} strokeWidth={1.7} />
						</View>
						<View style={styles.premiumBody}>
							<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
								{tp("settingsRow")}
							</Text>
							<Text
								testID="settings-premium-status"
								style={[
									theme.typography.caption,
									{ color: entitlement.premium ? theme.colors.energy : theme.colors.textMuted },
								]}
							>
								{entitlement.premium ? tp("status.premium") : tp("status.free")}
							</Text>
						</View>
						<Icon name="chevronRight" size={20} color={theme.colors.textFaint} />
					</Card>
				</Pressable>

				<NotificationsSettings />

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

				<PillButton
					label={t("settings.replayOnboarding")}
					variant="secondary"
					onPress={() => void replay()}
					accessibilityLabel={t("settings.replayOnboarding")}
					testID="settings-replay-onboarding"
				/>

				<Card>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{t("settings.privacyTitle")}
					</Text>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: 8 }]}>
						{t("settings.privacyBody")}
					</Text>
					<Pressable
						accessibilityRole="link"
						accessibilityLabel={t("settings.privacyLink")}
						testID="settings-privacy-link"
						onPress={() => Linking.openURL(PRIVACY_URL).catch(() => undefined)}
						style={styles.legalLink}
					>
						<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
							{t("settings.privacyLink")}
						</Text>
					</Pressable>
					<Pressable
						accessibilityRole="link"
						accessibilityLabel={t("settings.termsLink")}
						testID="settings-terms-link"
						onPress={() => Linking.openURL(TERMS_URL).catch(() => undefined)}
						style={styles.legalLink}
					>
						<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
							{t("settings.termsLink")}
						</Text>
					</Pressable>
				</Card>

				<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
					{t("settings.disclaimer")}
				</Text>

				<Pressable
					accessibilityRole="text"
					accessibilityLabel={t("settings.version", { version: appVersion })}
					testID="settings-version"
					onLongPress={onVersionLongPress}
					delayLongPress={350}
				>
					<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
						{t("settings.version", { version: appVersion })}
					</Text>
				</Pressable>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	exportCard: { flexDirection: "row", alignItems: "center", gap: 14 },
	exportBody: { flex: 1, gap: 2 },
	premiumRow: { flexDirection: "row", alignItems: "center", gap: 14 },
	rowIcon: {
		width: 42,
		height: 42,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	premiumBody: { flex: 1, gap: 2 },
	legalLink: { paddingVertical: 8 },
});
