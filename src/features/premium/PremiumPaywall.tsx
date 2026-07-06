/**
 * Paywall éthique (§8, CONTRACTUEL) — l'anti-Cal AI assumé.
 *
 * Règles non négociables encodées ici :
 *  - Bandeau d'engagement en HAUT : « données + export gratuits pour toujours ».
 *  - Les DEUX prix affichés IMMÉDIATEMENT (placeholders tant que le mock est actif).
 *  - Badge −50 % + équivalent mensuel sur l'annuel.
 *  - « Sans engagement — annulez en 2 taps » + essai « 10 analyses sans CB ».
 *  - Remboursement HUMAIN par mail dans le footer.
 *  - AUCUNE relance : ce composant ne s'ouvre que sur action explicite ; il n'y a
 *    jamais de « second flow » d'achat après un refus (violation Apple de Cal AI).
 *  - En mode onboarding : « Continuer gratuitement » a EXACTEMENT la même taille
 *    que « Essayer Premium » (§4.16).
 *
 * Direction « Clinique calme » : un seul accent (brand), zéro couleur d'alerte,
 * hairlines discrètes. Un moment d'achat qui doit inspirer confiance et calme.
 *
 * Réutilisé par l'écran modal `app/premium.tsx` et par l'écran 16 de l'onboarding.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Card, PillButton } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import { PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from "@/constants/branding";
import {
	getEntitlementsProvider,
	type Offerings,
	PLACEHOLDER_OFFERINGS,
	type PurchasePlan,
} from "@/services/entitlements";
import { useTheme } from "@/theme";

interface Props {
	/** `modal` = écran ouvert explicitement ; `onboarding` = écran 16 du funnel. */
	mode: "modal" | "onboarding";
	/** Fermeture (croix du modal, ou après achat en mode modal). */
	onClose?: () => void;
	/** Onboarding : « Continuer gratuitement ». */
	onContinueFree?: () => void;
	/** Achat réussi (les deux modes) — l'appelant enchaîne (fermer / finir l'onboarding). */
	onPurchased?: () => void;
}

const FEATURE_ROWS = [
	{ key: "unlimited", soon: false },
	{ key: "voice", soon: true },
	{ key: "insight", soon: true },
	{ key: "multiphoto", soon: false },
] as const;

export function PremiumPaywall({ mode, onClose, onContinueFree, onPurchased }: Props) {
	const { t } = useTranslation("premium");
	const theme = useTheme();
	const snackbar = useSnackbar();

	// Prix affichés IMMÉDIATEMENT : on part des placeholders, puis on rafraîchit.
	const [offerings, setOfferings] = useState<Offerings>(PLACEHOLDER_OFFERINGS);
	const [plan, setPlan] = useState<PurchasePlan>("annual");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let alive = true;
		getEntitlementsProvider()
			.getOfferings()
			.then((o) => {
				if (alive) setOfferings(o);
			})
			.catch(() => undefined);
		return () => {
			alive = false;
		};
	}, []);

	const doPurchase = useCallback(async () => {
		if (busy) return;
		setBusy(true);
		try {
			const res = await getEntitlementsProvider().purchase(plan);
			if (res.premium) {
				snackbar.show({ message: t("toasts.purchased") });
				onPurchased?.();
				return;
			}
			if (res.cancelled) {
				snackbar.show({ message: t("toasts.cancelled") });
				return;
			}
			snackbar.show({ message: t("toasts.error") });
		} catch {
			snackbar.show({ message: t("toasts.error") });
		} finally {
			setBusy(false);
		}
	}, [busy, plan, snackbar, t, onPurchased]);

	const doRestore = useCallback(async () => {
		if (busy) return;
		setBusy(true);
		try {
			const res = await getEntitlementsProvider().restore();
			if (res.premium) {
				snackbar.show({ message: t("toasts.restored") });
				onPurchased?.();
			} else {
				snackbar.show({ message: t("toasts.restoreNone") });
			}
		} catch {
			snackbar.show({ message: t("toasts.error") });
		} finally {
			setBusy(false);
		}
	}, [busy, snackbar, t, onPurchased]);

	const contactRefund = useCallback(() => {
		Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => undefined);
	}, []);

	// Gestion de l'abonnement (§3.1.2 App Store / G10) : ouvre la page abonnements
	// du store. Sur web (ni iOS ni Android), on pointe la page Google Play.
	const openManageSubscription = useCallback(() => {
		const url =
			Platform.OS === "ios"
				? "itms-apps://apps.apple.com/account/subscriptions"
				: "https://play.google.com/store/account/subscriptions";
		Linking.openURL(url).catch(() => undefined);
	}, []);

	return (
		<View style={styles.flex}>
			{/* Croix de fermeture : vrai bouton icône, en haut à droite, seul sur sa
			    rangée pour ne chevaucher aucun texte (§8, modal uniquement). */}
			{mode === "modal" ? (
				<View style={styles.headerRow}>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("close")}
						testID="premium-close"
						onPress={onClose}
						hitSlop={12}
						style={[
							styles.closeBtn,
							{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.pill },
						]}
					>
						<Icon name="x" size={18} color={theme.colors.textMuted} strokeWidth={2} />
					</Pressable>
				</View>
			) : null}

			{/* Bandeau d'engagement — TOUT EN HAUT (§8). Ton CALME : c'est une promesse
			    rassurante, pas une alerte. Fond doux `brandSoft`, un seul accent. */}
			<View
				testID="premium-commitment"
				style={[
					styles.commitment,
					{ backgroundColor: theme.colors.brandSoft, borderRadius: theme.radii.md },
				]}
			>
				<Icon name="sparkles" size={18} color={theme.colors.brand} strokeWidth={1.8} />
				<Text
					style={[theme.typography.caption, styles.commitmentText, { color: theme.colors.text }]}
				>
					{t("commitment")}
				</Text>
			</View>

			{/* Héro sobre. */}
			<View style={styles.hero}>
				<Text style={[theme.typography.title, { color: theme.colors.text }]}>
					{t("hero.title")}
				</Text>
				<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
					{t("hero.subtitle")}
				</Text>
			</View>

			{/* Liste métier — cases `check` en accent unique, items alignés. */}
			<Card style={{ gap: theme.spacing.md }}>
				<Text style={[theme.typography.overline, { color: theme.colors.textFaint }]}>
					{t("features.title")}
				</Text>
				{FEATURE_ROWS.map((row) => (
					<View key={row.key} style={styles.featureRow}>
						<View
							style={[
								styles.featureCheck,
								{ backgroundColor: theme.colors.brandSoft, borderRadius: theme.radii.pill },
							]}
						>
							<Icon name="check" size={14} color={theme.colors.brand} strokeWidth={2.4} />
						</View>
						<Text
							style={[theme.typography.body, styles.featureLabel, { color: theme.colors.text }]}
						>
							{t(`features.${row.key}`)}
						</Text>
						{row.soon ? (
							<View
								style={[
									styles.soonBadge,
									{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.pill },
								]}
							>
								<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
									{t("features.soon")}
								</Text>
							</View>
						) : null}
					</View>
				))}
			</Card>

			{/* Essai offert — sans CB. Argument clé « essaie sans risque » : carte douce,
			    picto caméra en accent, hiérarchie claire. */}
			<View
				style={[
					styles.trial,
					{
						backgroundColor: theme.colors.surface,
						borderRadius: theme.radii.lg,
						borderColor: theme.colors.border,
					},
				]}
			>
				<View
					style={[
						styles.trialIcon,
						{ backgroundColor: theme.colors.brandSoft, borderRadius: theme.radii.md },
					]}
				>
					<Icon name="camera" size={20} color={theme.colors.brand} strokeWidth={1.8} />
				</View>
				<Text style={[theme.typography.label, styles.trialText, { color: theme.colors.text }]}>
					{t("trial")}
				</Text>
			</View>

			{/* Les DEUX prix, affichés immédiatement. */}
			<View style={styles.plans}>
				<PlanCard
					testID="premium-price-monthly"
					selected={plan === "monthly"}
					onPress={() => setPlan("monthly")}
					label={t("plans.monthlyLabel")}
					price={offerings.monthly.price}
					per={t("plans.monthlyPer")}
				/>
				<PlanCard
					testID="premium-price-annual"
					selected={plan === "annual"}
					onPress={() => setPlan("annual")}
					label={t("plans.annualLabel")}
					price={offerings.annual.price}
					per={t("plans.annualPer")}
					badge={t("plans.annualBadge")}
					sub={t("plans.annualEquivalent", { price: offerings.annual.monthlyEquivalent })}
				/>
			</View>

			<Text style={[theme.typography.caption, styles.centered, { color: theme.colors.textMuted }]}>
				{t("noCommitment")}
			</Text>

			{/* CTA — dépend du mode. */}
			{mode === "onboarding" ? (
				<View style={styles.ctaStack}>
					{/* §4.16 : les deux boutons ont EXACTEMENT la même taille. */}
					<PillButton
						label={t("onboarding.tryPremium")}
						accessibilityLabel={t("onboarding.tryPremium")}
						onPress={doPurchase}
						loading={busy}
						testID="premium-try"
					/>
					<PillButton
						label={t("onboarding.continueFree")}
						accessibilityLabel={t("onboarding.continueFree")}
						variant="secondary"
						onPress={() => onContinueFree?.()}
						disabled={busy}
						testID="premium-continue-free"
					/>
				</View>
			) : (
				<View style={styles.ctaStack}>
					<PillButton
						label={t("continue")}
						accessibilityLabel={t("continue")}
						onPress={doPurchase}
						loading={busy}
						testID="premium-continue"
					/>
				</View>
			)}

			{/* Divulgation légale (§3.1.2) : abonnement auto-renouvelable, adjacente à
			    l'achat. Petit corps discret, lisible, jamais un piège. */}
			<Text
				testID="premium-autorenew"
				style={[theme.typography.caption, styles.disclosure, { color: theme.colors.textFaint }]}
			>
				{t("autoRenewDisclosure")}
			</Text>

			{/* Rangée de liens de compte : accent unique, hiérarchie discrète. */}
			<View style={styles.linkRow}>
				<Pressable
					accessibilityRole="link"
					accessibilityLabel={t("manageSubscription")}
					testID="premium-manage-sub"
					onPress={openManageSubscription}
					hitSlop={8}
				>
					<Text style={[theme.typography.label, { color: theme.colors.brand }]}>
						{t("manageSubscription")}
					</Text>
				</Pressable>
				<Text style={[theme.typography.label, { color: theme.colors.border }]}>·</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("restore")}
					testID="premium-restore"
					onPress={doRestore}
					disabled={busy}
					hitSlop={8}
				>
					<Text style={[theme.typography.label, { color: theme.colors.brand }]}>
						{t("restore")}
					</Text>
				</Pressable>
			</View>

			{/* Footer : remboursement humain par mail. */}
			<Pressable
				accessibilityRole="link"
				accessibilityLabel={t("refund", { email: SUPPORT_EMAIL })}
				testID="premium-refund"
				onPress={contactRefund}
				style={styles.footer}
			>
				<Text
					style={[theme.typography.caption, styles.centered, { color: theme.colors.textFaint }]}
				>
					{t("refund", { email: SUPPORT_EMAIL })}
				</Text>
			</Pressable>

			{/* Liens légaux : confidentialité · conditions (EULA), accent discret. */}
			<View style={styles.legalRow}>
				<Pressable
					accessibilityRole="link"
					accessibilityLabel={t("links.privacy")}
					testID="premium-privacy-link"
					onPress={() => Linking.openURL(PRIVACY_URL).catch(() => undefined)}
					hitSlop={8}
				>
					<Text style={[theme.typography.caption, { color: theme.colors.brand }]}>
						{t("links.privacy")}
					</Text>
				</Pressable>
				<Text style={[theme.typography.caption, { color: theme.colors.border }]}>·</Text>
				<Pressable
					accessibilityRole="link"
					accessibilityLabel={t("links.terms")}
					testID="premium-terms-link"
					onPress={() => Linking.openURL(TERMS_URL).catch(() => undefined)}
					hitSlop={8}
				>
					<Text style={[theme.typography.caption, { color: theme.colors.brand }]}>
						{t("links.terms")}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

function PlanCard({
	selected,
	onPress,
	label,
	price,
	per,
	badge,
	sub,
	testID,
}: {
	selected: boolean;
	onPress: () => void;
	label: string;
	price: string;
	per: string;
	badge?: string;
	sub?: string;
	testID: string;
}) {
	const theme = useTheme();
	return (
		<Pressable
			accessibilityRole="radio"
			accessibilityState={{ selected }}
			accessibilityLabel={`${label} ${price}`}
			testID={testID}
			onPress={onPress}
			style={({ pressed }) => [
				styles.planCard,
				{
					borderRadius: theme.radii.xl,
					// Sélection = teinte + bordure `brand` (jamais noir pur), feedback au tap.
					backgroundColor: selected ? theme.colors.brandSoft : theme.colors.card,
					borderColor: selected ? theme.colors.brand : theme.colors.border,
					borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
					opacity: pressed ? 0.92 : 1,
				},
			]}
		>
			{badge ? (
				<View
					style={[
						styles.planBadge,
						{ backgroundColor: theme.colors.brand, borderRadius: theme.radii.pill },
					]}
				>
					<Text style={[styles.planBadgeText, { color: theme.colors.ctaText }]}>{badge}</Text>
				</View>
			) : null}
			<Text style={[theme.typography.overline, { color: theme.colors.textMuted }]}>{label}</Text>
			<Text style={[theme.typography.dataLg, styles.planPrice, { color: theme.colors.text }]}>
				{price}
			</Text>
			<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{per}</Text>
			{sub ? (
				<Text style={[theme.typography.caption, styles.planSub, { color: theme.colors.textMuted }]}>
					{sub}
				</Text>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	flex: { gap: 16 },
	headerRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: -8 },
	closeBtn: { padding: 9 },
	commitment: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	commitmentText: { flex: 1, lineHeight: 18 },
	hero: { gap: 6 },
	featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	featureCheck: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
	featureLabel: { flex: 1 },
	soonBadge: { paddingHorizontal: 9, paddingVertical: 3 },
	trial: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		paddingHorizontal: 14,
		paddingVertical: 14,
		borderWidth: StyleSheet.hairlineWidth,
	},
	trialIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
	trialText: { flex: 1, lineHeight: 20 },
	plans: { flexDirection: "row", gap: 12 },
	planCard: { flex: 1, padding: 14, gap: 3, minHeight: 132, justifyContent: "center" },
	planPrice: { marginTop: 2 },
	planSub: { marginTop: 3 },
	planBadge: {
		position: "absolute",
		top: -9,
		right: 10,
		paddingHorizontal: 9,
		paddingVertical: 3,
	},
	planBadgeText: { fontSize: 12, fontWeight: "700" },
	centered: { textAlign: "center" },
	disclosure: { textAlign: "center", paddingHorizontal: 4, lineHeight: 18 },
	ctaStack: { gap: 10 },
	linkRow: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		gap: 10,
		paddingVertical: 2,
	},
	footer: { paddingVertical: 4, paddingHorizontal: 8 },
	legalRow: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		gap: 8,
		paddingVertical: 4,
	},
});
