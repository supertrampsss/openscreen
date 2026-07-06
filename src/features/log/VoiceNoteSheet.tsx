import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { DraftSheet, PillButton } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import type { VoiceDraft } from "@/domain/voiceEntries";
import { voiceEntriesToDrafts } from "@/domain/voiceEntries";
import { useEntitlements } from "@/services/entitlements";
import {
	commitVoiceDrafts,
	createSpeechRecognizer,
	parseVoice,
	VoiceError,
	voiceBaseTimestamp,
} from "@/services/voiceService";
import type { DataColorKey, ThemeColors } from "@/theme";
import { useTheme } from "@/theme";
import { Eyebrow, RemoveButton } from "./sheetKit";

interface Props {
	visible: boolean;
	onClose: () => void;
	onSaved: () => void;
	/** Ouvre le sheet détaillé pré-rempli pour une entrée (édition). */
	onEditEntry: (draft: VoiceDraft) => void;
	/** Ouvre le paywall éthique (§8). */
	onSeePremium: () => void;
}

const ICONS: Record<VoiceDraft["type"], IconName> = {
	stool: "stool",
	symptom: "pulse",
	meal: "utensils",
};
const TINTS: Record<VoiceDraft["type"], DataColorKey> = {
	stool: "stool",
	symptom: "pain",
	meal: "meal",
};
const SOFTS: Record<VoiceDraft["type"], keyof ThemeColors> = {
	stool: "stoolSoft",
	symptom: "painSoft",
	meal: "mealSoft",
};

/**
 * Note vocale (§5.4, §6.1, §7) — Premium. Deux phases dans le DraftSheet commun :
 *   1) saisie : gros champ texte (dictée clavier système = STT on-device) +
 *      bouton micro si l'API Web Speech est dispo → « Interpréter » ;
 *   2) revue : chips par type éditables (tap = sheet pré-rempli, × = retire) →
 *      « Tout enregistrer » committe chaque entrée via les repos existants.
 * Si non-Premium : teaser (jamais imposé, pas de second flow).
 */
export function VoiceNoteSheet({ visible, onClose, onSaved, onEditEntry, onSeePremium }: Props) {
	const { t, i18n } = useTranslation("voice");
	const theme = useTheme();
	const snackbar = useSnackbar();
	// Statut Premium relu à chaque ouverture (évite toute course de semis/état).
	const { status, reload: reloadEntitlement } = useEntitlements();
	const premium = status.premium;

	const [text, setText] = useState("");
	const [drafts, setDrafts] = useState<VoiceDraft[] | null>(null);
	const [demo, setDemo] = useState(false);
	const [busy, setBusy] = useState(false);
	const [listening, setListening] = useState(false);

	/** Résumé lisible d'un brouillon voix (chips par type). */
	const describeDraft = (draft: VoiceDraft): string => {
		if (draft.type === "stool") {
			const parts = [t("entry.stool", { count: draft.count })];
			if (draft.bristol != null) parts.push(t("entry.bristol", { value: draft.bristol }));
			return parts.join(" · ");
		}
		if (draft.type === "symptom") {
			const parts: string[] = [];
			if (draft.pain != null) parts.push(t("entry.pain", { value: draft.pain }));
			if (draft.fatigue != null) parts.push(t("entry.fatigue", { value: draft.fatigue }));
			return parts.length ? parts.join(" · ") : t("entry.symptom");
		}
		return t("entry.meal", { name: draft.name });
	};

	const recognizer = useMemo(() => createSpeechRecognizer(i18n.language), [i18n.language]);
	const recognizerRef = useRef(recognizer);
	recognizerRef.current = recognizer;

	// Réinitialise à chaque ouverture (arrête toute écoute en cours) + relit le
	// statut Premium (le semis E2E / l'achat peuvent l'avoir changé depuis le mount).
	useEffect(() => {
		if (visible) {
			setText("");
			setDrafts(null);
			setDemo(false);
			setBusy(false);
			setListening(false);
			reloadEntitlement();
		} else {
			recognizerRef.current.stop();
		}
	}, [visible, reloadEntitlement]);

	const toggleMic = () => {
		if (listening) {
			recognizer.stop();
			setListening(false);
			return;
		}
		setListening(true);
		recognizer.start({
			onResult: setText,
			onEnd: () => setListening(false),
			onError: () => setListening(false),
		});
	};

	const interpret = async () => {
		if (!text.trim() || busy) return;
		recognizer.stop();
		setListening(false);
		setBusy(true);
		try {
			const { entries, demo: isDemo } = await parseVoice(text);
			setDemo(isDemo);
			setDrafts(voiceEntriesToDrafts(entries, voiceBaseTimestamp()));
		} catch (e) {
			const kind = e instanceof VoiceError ? e.kind : "server";
			if (kind === "premium_required") onSeePremium();
			else snackbar.show({ message: t(`errors.${kind}`) });
		} finally {
			setBusy(false);
		}
	};

	const removeAt = (index: number) =>
		setDrafts((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));

	const editAt = (index: number) => {
		const draft = drafts?.[index];
		if (!draft) return;
		removeAt(index);
		onEditEntry(draft);
	};

	const saveAll = async () => {
		if (!drafts || drafts.length === 0 || busy) return;
		setBusy(true);
		try {
			const saved = await commitVoiceDrafts(drafts);
			snackbar.show({ message: t("saved", { count: saved }) });
			onSaved();
			onClose();
		} catch {
			// Échec jamais silencieux : la revue reste ouverte pour réessayer.
			snackbar.show({ message: t("saveError") });
		} finally {
			setBusy(false);
		}
	};

	// --- Teaser Premium (non abonné) ---------------------------------------
	if (!premium) {
		return (
			<DraftSheet visible={visible} onClose={onClose} title={t("premium.title")}>
				<Text style={[theme.typography.body, { color: theme.colors.text }]}>
					{t("premium.body")}
				</Text>
				<PillButton
					label={t("premium.see")}
					accessibilityLabel={t("premium.see")}
					onPress={onSeePremium}
					testID="voice-see-premium"
				/>
			</DraftSheet>
		);
	}

	const reviewing = drafts !== null;

	return (
		<DraftSheet
			visible={visible}
			onClose={onClose}
			title={t("title")}
			confirmLabel={reviewing && drafts.length > 0 ? t("review.saveAll") : undefined}
			onConfirm={reviewing && drafts.length > 0 ? saveAll : undefined}
			confirmDisabled={busy}
			confirmTestID="voice-save-all"
			confirmAccessibilityLabel={t("review.saveAll")}
		>
			{demo ? (
				<View
					testID="voice-demo-banner"
					style={[styles.banner, { backgroundColor: theme.colors.flareBackground }]}
				>
					<Text style={[theme.typography.caption, { color: theme.colors.pain }]}>
						{t("demoBanner")}
					</Text>
				</View>
			) : null}

			{!reviewing ? (
				<>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{t("intro")}
					</Text>
					{/* Transparence IA (privacy) : où va le texte, sobre et discret. */}
					<Text
						testID="voice-ai-disclosure"
						style={[theme.typography.caption, { color: theme.colors.textFaint }]}
					>
						{t("aiDisclosure")}
					</Text>
					<TextInput
						accessibilityLabel={t("title")}
						testID="voice-input"
						placeholder={t("placeholder")}
						placeholderTextColor={theme.colors.textFaint}
						value={text}
						onChangeText={setText}
						multiline
						style={[
							styles.input,
							theme.typography.body,
							{
								color: theme.colors.text,
								backgroundColor: theme.colors.surface,
								borderRadius: theme.radii.md,
							},
						]}
					/>
					<View style={styles.actions}>
						{recognizer.available ? (
							<PillButton
								label={listening ? t("micStop") : t("mic")}
								accessibilityLabel={listening ? t("micStop") : t("mic")}
								variant="secondary"
								fullWidth={false}
								onPress={toggleMic}
								testID="voice-mic"
							/>
						) : null}
						<PillButton
							label={busy ? t("interpreting") : t("interpret")}
							accessibilityLabel={t("interpret")}
							fullWidth={false}
							onPress={interpret}
							disabled={busy || !text.trim()}
							testID="voice-interpret"
						/>
					</View>
					{busy ? <ActivityIndicator color={theme.colors.meal} /> : null}
				</>
			) : (
				<View style={{ gap: theme.spacing.sm }} testID="voice-review">
					<Eyebrow>{t("review.title")}</Eyebrow>
					{drafts.length === 0 ? (
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("review.empty")}
						</Text>
					) : (
						drafts.map((draft, index) => {
							const label = describeDraft(draft);
							return (
								<View
									key={`${draft.type}-${index}`}
									testID={`voice-entry-${index}`}
									style={[
										styles.row,
										{ borderRadius: theme.radii.md, backgroundColor: theme.colors.surface },
									]}
								>
									<Pressable
										accessibilityRole="button"
										accessibilityLabel={t("review.edit", { label })}
										testID={`voice-edit-${index}`}
										onPress={() => editAt(index)}
										style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.7 : 1 }]}
									>
										<View
											style={[styles.avatar, { backgroundColor: theme.colors[SOFTS[draft.type]] }]}
										>
											<Icon
												name={ICONS[draft.type]}
												size={18}
												color={theme.colors[TINTS[draft.type]]}
												strokeWidth={1.8}
											/>
										</View>
										<Text
											style={[
												theme.typography.subheading,
												styles.rowLabel,
												{ color: theme.colors.text },
											]}
										>
											{label}
										</Text>
									</Pressable>
									<RemoveButton
										accessibilityLabel={t("review.remove", { label })}
										testID={`voice-remove-${index}`}
										onPress={() => removeAt(index)}
									/>
								</View>
							);
						})
					)}
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("review.back")}
						testID="voice-back"
						onPress={() => setDrafts(null)}
						style={({ pressed }) => [styles.backRow, { opacity: pressed ? 0.6 : 1 }]}
					>
						<Icon name="chevronLeft" size={16} color={theme.colors.meal} strokeWidth={1.8} />
						<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
							{t("review.back")}
						</Text>
					</Pressable>
				</View>
			)}
		</DraftSheet>
	);
}

const styles = StyleSheet.create({
	banner: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
	input: { minHeight: 96, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: "top" },
	actions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
	rowLabel: { flex: 1 },
	avatar: {
		width: 34,
		height: 34,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	backRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
		minHeight: 32,
		paddingVertical: 2,
	},
});
