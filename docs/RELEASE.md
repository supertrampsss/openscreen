# Crohnicle — Production release checklist

Everything below is required to ship Crohnicle to the App Store / Google Play with
real Premium billing and notifications. The app **runs fully without any of it**
(mock entitlements, demo AI, no notifications on web), so treat this as the
"go-live" runbook, not a prerequisite for development.

> Health-app + subscription guidelines are strict. The three **Cal AI violations**
> that got it pulled from the App Store in April 2026 are called out below — never
> reproduce them. Our entire design is the anti-Cal AI (§8 of the product bible).

---

## 0. Accounts & tooling

- [ ] Apple Developer Program membership (99 $/yr), App Store Connect app record.
- [ ] Google Play Console account (25 $ one-time), app record + data-safety form.
- [ ] [EAS](https://expo.dev) project (`eas init`), `eas.json` build profiles.
- [ ] Node 22 (repo-pinned), `npx expo-doctor` clean (2 network checks fail behind
      a proxy — that is expected, everything else must be green).

---

## 1. Entitlements — switch mock → RevenueCat

The app talks to billing only through `src/services/entitlements.ts`. The default
provider is **mock** (persists a fake `premium` flag in settings). To go live:

1. [ ] Create a [RevenueCat](https://revenuecat.com) project; add the iOS + Android
       apps; create a **single entitlement `premium`**.
2. [ ] Create the store products and attach them to a RevenueCat offering:
   - Monthly auto-renewable subscription — placeholder price **4,99 €/mo**.
   - Annual auto-renewable subscription — placeholder price **29,99 €/yr**
     (the paywall shows the "−50 %" badge and the "2,50 €/mo" equivalent).
   - Grant a **10-analysis free trial with NO credit card** (enforced by the Worker
     quota, not by an App Store trial) — keep it that way.
3. [ ] Install the native SDK in a **dev build** (not Expo Go):
       `npx expo install react-native-purchases` then `eas build`.
4. [ ] In `src/services/entitlements.ts` → `RevenueCatEntitlementsProvider`,
       **uncomment** the `react-native-purchases` calls (they are written and
       commented, method by method). Delete the `notConfigured()` throws.
5. [ ] Set `EXPO_PUBLIC_ENTITLEMENTS=revenuecat` (EAS env / `.env`). Default is
       `mock`; any other value stays mock.
6. [ ] Wire the Worker entitlement check: set `REVENUECAT_API_KEY` on the Worker
       (see [`DEPLOY_WORKER.md`](./DEPLOY_WORKER.md)); `getEntitlementToken()` already
       returns the RevenueCat app-user-id that the Worker verifies.
7. [ ] Remove the hidden dev toggle path if desired (Settings → long-press ×5 on the
       version toggles the **mock** flag only; it is a no-op under RevenueCat).

### Paywall guardrails (App Store review — do NOT regress)

- [ ] **Prices shown immediately and fixed** — no dynamic/hidden pricing.
      *(Cal AI violation #1: deceptive weekly price.)*
- [ ] **No trial toggle that hides auto-renewal** — if a CB trial is ever added, show
      the transparent timeline ("Today unlocked → D5 reminder → D7 billed").
      *(Cal AI violation #2.)*
- [ ] **Never a second purchase flow after a refusal** — the paywall opens only on
      explicit user action and never re-prompts on close.
      *(Cal AI violation #3: second flow after decline.)*
- [ ] "No commitment — cancel in 2 taps" copy present; human refund email in the footer.
- [ ] "Continue for free" is the **same size** as "Try Premium" on the onboarding
      paywall (§4.16).
- [ ] Data + export are free forever (commitment banner) — never paywall them.

---

## 2. AI proxy (Cloudflare Worker)

- [ ] Deploy per [`DEPLOY_WORKER.md`](./DEPLOY_WORKER.md): `ANTHROPIC_API_KEY`,
      optional `REVENUECAT_API_KEY`, KV namespace for the trial quota.
- [ ] Set `EXPO_PUBLIC_AI_PROXY_URL` to the deployed Worker URL (else the app stays
      in labelled demo mode).
- [ ] Confirm photos are never stored and logs carry no image content.

---

## 3. Notifications (§7)

- [ ] `expo-notifications` plugin is declared in `app.json` (done).
- [ ] All opt-in, granular, max 2/day by construction — do not add more.
- [ ] Evening nudge is cancelled the moment the day has a log; the Premium
      trial-end reminder (when a CB trial exists) **must actually be sent** — the
      broken promise was Cal AI's worst review.
- [ ] iOS: notification permission is requested from onboarding screen 12 *after* an
      explanation, with a visible "Later". Android channel `reminders` is created.

---

## 4. Quick actions & deep links (§5.12)

- [ ] `expo-quick-actions` plugin declared in `app.json` (done). The three actions
      (Quick stool / Meal photo / Emergency card) register via `setItems` and route
      through `useQuickActionRouting` in the tabs layout.
- [ ] **Requires a dev build** to appear on the home-screen icon long-press — they are
      no-ops in Expo Go and on web. Verify on a device build:
   - Long-press app icon → 3 actions.
   - `crohnicle://log/stool`, `crohnicle://log/photo`, `crohnicle://urgence` open the
     right target (these deep links work today, independent of native quick actions).
- [ ] Home-screen **widgets** and **Apple Health / Google Fit** are Phase 10 (need the
      dev build + native modules) — documented, not shipped here.

---

## 5. Build, submit, review

- [ ] `npm run lint && npm run typecheck && npm run test && npm run i18n:check` green.
- [ ] `npm run build:web && npx playwright test` green (8 specs).
- [ ] `eas build --platform all` (dev build first to verify billing + quick actions,
      then production).
- [ ] `eas submit`.
- [ ] App Store review notes: **not a medical device** (disclaimer in-app, onboarding,
      and PDF export); subscriptions follow guideline 3.1.2; health data stays 100%
      on-device (the structural anti-breach — Cal AI leaked 3M profiles via an
      unauthenticated Firebase; we have no backend for health data).
- [ ] ASO FR first (§1 francophone gap); store screenshots of scan + doctor export.

---

## 6. Branding (before public launch)

- [ ] Confirm/replace the working name **Crohnicle** — centralised in
      `app.json` + `src/constants/branding.ts` (name, store URLs, support email).
- [ ] Replace placeholder `STORE_URLS` and `SUPPORT_EMAIL`.
- [ ] Final app icons / splash.
