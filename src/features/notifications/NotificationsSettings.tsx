/**
 * Section Notifications des Réglages (§7, §5.11) — interrupteur maître, réglages
 * par type (rappel du soir, bilan hebdo) et heure du rappel. Tout opt-in.
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Card, TapRow } from "@/components/ui";
import { formatReminderTime } from "@/domain/notifications";
import { useNotificationPrefs } from "@/services/notificationService";
import { useTheme } from "@/theme";

/** Presets d'heure du rappel du soir, en minutes depuis minuit. */
const TIME_PRESETS = [18 * 60, 19 * 60 + 30, 20 * 60 + 30, 21 * 60 + 30, 22 * 60];

export function NotificationsSettings() {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const { prefs, update, supported } = useNotificationPrefs();

	const currentMinutes = prefs.reminderHour * 60 + prefs.reminderMinute;

	return (
		<View style={{ gap: theme.spacing.sm }}>
			<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
				{t("notifications.sectionTitle")}
			</Text>
			<Card style={{ gap: theme.spacing.md }}>
				<Row
					label={t("notifications.master")}
					hint={supported ? t("notifications.masterHint") : t("notifications.unsupported")}
				>
					<Switch
						testID="notif-master"
						value={prefs.master}
						disabled={!supported}
						onValueChange={(v) => void update({ master: v })}
						trackColor={{ true: theme.colors.energy }}
					/>
				</Row>

				{prefs.master && supported ? (
					<>
						<Divider />
						<Row label={t("notifications.evening")} hint={t("notifications.eveningHint")}>
							<Switch
								testID="notif-evening"
								value={prefs.eveningReminder}
								onValueChange={(v) => void update({ eveningReminder: v })}
								trackColor={{ true: theme.colors.energy }}
							/>
						</Row>
						<Row label={t("notifications.weekly")} hint={t("notifications.weeklyHint")}>
							<Switch
								testID="notif-weekly"
								value={prefs.weeklyDigest}
								onValueChange={(v) => void update({ weeklyDigest: v })}
								trackColor={{ true: theme.colors.energy }}
							/>
						</Row>
						{prefs.eveningReminder ? (
							<View style={{ gap: theme.spacing.sm }}>
								<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
									{t("notifications.time")}
								</Text>
								<TapRow
									options={TIME_PRESETS.map((m) => ({
										value: m,
										label: formatReminderTime(Math.floor(m / 60), m % 60),
										testID: `notif-time-${m}`,
									}))}
									value={currentMinutes}
									onChange={(m) =>
										void update({ reminderHour: Math.floor(m / 60), reminderMinute: m % 60 })
									}
									tint="energy"
								/>
							</View>
						) : null}
					</>
				) : null}
			</Card>
		</View>
	);
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
	const theme = useTheme();
	return (
		<View style={styles.row}>
			<View style={styles.rowText}>
				<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>{label}</Text>
				<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{hint}</Text>
			</View>
			{children}
		</View>
	);
}

function Divider() {
	const theme = useTheme();
	return <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
	rowText: { flex: 1, gap: 2 },
	divider: { height: StyleSheet.hairlineWidth },
});
