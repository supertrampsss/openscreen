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
5. [ ] Set `EXPO_PUBLIC_ENTITLEMENTS=revenuecat` — **including in `eas.json`**:
       flip the `preview` and `production` profiles' `env` from `mock` to
       `revenuecat`. All profiles ship as `mock` on purpose (safe default): a
       release built before step 4 would otherwise have a broken paywall, since
       the RevenueCat provider throws until wired.
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

The Worker (`server/`) exposes three endpoints, all through the frozen cached
prompts + structured outputs (`claude-haiku-4-5`):

- `POST /analyze-meal` — meal photo → trigger attributes. Trial quota (10 free
  photos, no card) OR premium; images never stored.
- `POST /parse-voice` — **text only** (on-device STT; audio is never uploaded) →
  structured diary entries. **Premium only** (403 `premium_required` otherwise).
- `POST /weekly-insight` — **anonymous aggregates only** → a short kind weekly
  insight. **Premium only**. No raw entries, notes or dates ever leave the device.

Checklist:

- [ ] Deploy per [`DEPLOY_WORKER.md`](./DEPLOY_WORKER.md): `ANTHROPIC_API_KEY`,
      optional `REVENUECAT_API_KEY`, KV namespace for the trial quota.
- [ ] Set `EXPO_PUBLIC_AI_PROXY_URL` to the deployed Worker URL (else the app stays
      in labelled demo mode for all three endpoints).
- [ ] Do **not** set `DEMO_ALLOW_TRIAL` in production — it opens the premium voice
      and insight endpoints without an entitlement (local-demo escape hatch only).
- [ ] Confirm photos are never stored, transcripts/aggregates carry no PII, and
      logs carry no content (only route, status, duration, truncated device id).

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
- [ ] `npm run build:web && PW_CHROMIUM_PATH=… npx playwright test` green (11 spec
      files, 12 tests).
- [ ] `eas build --platform all` (dev build first to verify billing + quick actions,
      then production). See §7 for `eas.json` profiles.
- [ ] `eas submit`.
- [ ] App Store review notes: **not a medical device** (disclaimer in-app, onboarding,
      and PDF export); subscriptions follow guideline 3.1.2; health data stays 100%
      on-device (the structural anti-breach — Cal AI leaked 3M profiles via an
      unauthenticated Firebase; we have no backend for health data).
- [ ] ASO FR first (§1 francophone gap); store screenshots of scan + doctor export.

---

## 6. Branding (before public launch)

- [x] Name **Crohnicle** confirmed — centralised in `app.json` +
      `src/constants/branding.ts` (name, tagline, brand colors, store URLs, support
      email). Renaming = those two files.
- [x] App icon / splash / adaptive icon / favicon generated (violet "C" monogram
      `#8B5CF6` on `#F7F7F8`) — reproducible via `node scripts/gen-icons.mjs`
      (pure Node, no external dependency). Splash + adaptive backgrounds use the
      brand palette (light `#F7F7F8`, dark `#0A0A0A`).
- [ ] Replace placeholder `STORE_URLS` and `SUPPORT_EMAIL` with the real records.
- [ ] (Optional) Have a designer refine the monogram / add a wordmark before launch;
      the generator is a clean, on-brand placeholder, not a final logotype.

---

## 7. EAS build & submit (`eas.json`)

`eas.json` is committed with three profiles:

| Profile       | Distribution | `EXPO_PUBLIC_ENTITLEMENTS`                    | Use                                  |
| ------------- | ------------ | --------------------------------------------- | ------------------------------------ |
| `development` | internal     | `mock`                                        | dev client; test flows without stores |
| `preview`     | internal     | `mock` (→ `revenuecat` after RevenueCat step) | internal QA                           |
| `production`  | store        | `mock` (→ `revenuecat` after RevenueCat step) | App Store / Play submission           |

Step by step:

1. [ ] `npm i -g eas-cli` (or `npx eas-cli`), then `eas login`.
2. [ ] `eas init` — links the project, writes the EAS `projectId` into `app.json`
       (`extra.eas.projectId`).
3. [ ] Set per-profile secrets in the EAS dashboard or via `eas env:create`:
       `EXPO_PUBLIC_AI_PROXY_URL` (the deployed Worker URL), and any RevenueCat
       public SDK keys the native module needs.
4. [ ] **Dev build first** (native modules + on-device checks that Expo Go / web
       cannot run — see §8/§9): `eas build --profile development --platform ios`
       (and `--platform android`). Install on a device.
5. [ ] Verify on the dev build: RevenueCat purchase/restore, home-screen quick
       actions (long-press icon), native STT for voice (if a native module is
       added — the keyboard-dictation path already works everywhere).
6. [ ] `eas build --profile production --platform all`, then
       `eas submit --profile production --platform all`.

## 8. Native E2E (Maestro) — post-dev-build

Playwright covers the **web** export (fast, deterministic, in CI). Native-only
paths (camera capture, real notifications, quick actions, RevenueCat) need a
device flow. [Maestro](https://maestro.mobile.dev) flows live in
[`maestro/`](../maestro), reuse the same `testID`s as the Playwright specs, and
target the app's bundle id `app.crohnicle` (from `app.json`):

- [`maestro/selle-rapide.yaml`](../maestro/selle-rapide.yaml) — 3-tap stool log, `<5 s`.
- [`maestro/scan-demo.yaml`](../maestro/scan-demo.yaml) — meal photo scan in demo mode (result sheet → confirm).
- [`maestro/export-medecin.yaml`](../maestro/export-medecin.yaml) — Settings → Export → generate the doctor PDF.
- [`maestro/onboarding.yaml`](../maestro/onboarding.yaml) — minimal funnel walk to the tabs (`clearState`).

Run all of them on a running dev build:

```sh
maestro test maestro/
```

Notes: these run **against a dev/production build**, not Expo Go or web. The scan
flow's photo pick happens in the native gallery (system UI, OS-specific) and is
left as a manual step; the flow resumes at the analysis shimmer. Flows still
worth adding later: **voice note** (dictation → interpreted entries → save all)
and **weekly insight** (premium).

## 9. Home-screen widgets & quick actions (roadmap)

- [x] **Quick actions** (long-press app icon) are wired via `expo-quick-actions`
      and the `crohnicle://` deep links (Quick stool / Meal photo / Emergency card).
      They appear only on a **dev/production build**, not in Expo Go or on web.
- [ ] **Home-screen widgets** (streak + 💩 quick log + 📸; iOS lock-screen stool
      log — §5.12) require a native widget extension (WidgetKit / Glance). This is a
      **post-launch** item: add a config plugin or a custom native module in the dev
      build, expose a shared app-group store for the streak count, and route widget
      taps through the existing deep links.

## 10. Apple Health / Google Fit (roadmap)

- [ ] Optional, opt-in (onboarding screen 13). Post-launch: add a HealthKit /
      Health Connect module in the dev build to read weight and (optionally) write a
      symptom/mindful summary. Health data stays on-device; nothing is uploaded.
      Gate strictly behind explicit consent and a clear privacy explanation.

## 11. ASO — French first (§1: the francophone gap)

The store listing is the growth lever (§1: no maintained FR IBD tracker). Draft,
honest, no dynamic-pricing claims:

- **Title (30 char max):** `Crohnicle — Journal MICI`
- **Subtitle (30 char max):** `Crohn & RCH, sans prise de tête`
- **Keywords (100 char, comma-separated, no spaces):**
  `mici,crohn,rch,colite,mici,selles,bristol,poussée,gastro,ibd,intestin,fodmap,symptômes,rémission`
- **Promotional text (170 char):**
  `Documentez vos symptômes en secondes, comprenez vos déclencheurs, et arrivez
  armé chez votre gastro. Journal, tendances et export PDF gratuits à vie.`

### Store description (FR, ready to paste — under 4000 chars)

```
Crohnicle est le compagnon des personnes vivant avec une MICI (maladie de Crohn ou rectocolite hémorragique). Documentez votre maladie en quelques secondes par jour, comprenez vos déclencheurs, et préparez vos consultations — sans y passer votre vie, et sans anxiété.

GRATUIT À VIE, VRAIMENT
Tous vos logs, votre journal, vos tendances, vos scores HBI/SCCAI, vos associations alimentaires et l'export pour votre médecin sont gratuits — pour toujours. C'est écrit dans l'app, et nous nous y engageons. Pas de paywall sur vos données ni sur leur export.

ZÉRO FRICTION
- Selle rapide en 3 taps, moins de 5 secondes.
- Photo de repas : l'IA pré-remplit les ingrédients et leurs attributs déclencheurs (FODMAP, lactose, gluten, friture, épicé, fibres, alcool, caféine, additifs) — vous confirmez d'un tap.
- Note vocale : dictez votre journée, on la transforme en entrées à valider.
- Aucun champ obligatoire, des valeurs par défaut intelligentes.

COMPRENEZ VOS DÉCLENCHEURS
Après 14 jours de suivi, Crohnicle met en évidence vos associations alimentaires (avec des garde-fous statistiques honnêtes : « association observée, pas une preuve »). Courbes de selles, douleur, fatigue, et score d'activité estimé (HBI pour Crohn, SCCAI pour la RCH).

ARRIVEZ ARMÉ CHEZ VOTRE GASTRO
Générez un PDF clair et lisible (1, 3 ou 6 mois) : courbe d'activité, tableaux hebdomadaires, observance des traitements, et « 3 points à aborder avec votre gastro ». La fonction la plus utile, gratuite à vie.

JAMAIS ANXIOGÈNE
Pas de score « santé » culpabilisant, pas de rouge alarmiste. Votre série (streak) est automatiquement gelée pendant une poussée. Un ton bienveillant, toujours.

VOS DONNÉES RESTENT CHEZ VOUS
Vos données de santé sont stockées et traitées sur votre appareil. Pas de compte obligatoire, pas d'analytics tiers. L'analyse photo passe par un proxy sans stockage ; aucune photo n'est conservée. La reconnaissance vocale est faite sur l'appareil : aucun audio n'est envoyé.

PREMIUM (optionnel)
L'abonnement Premium débloque les analyses photo illimitées (10 offertes sans carte bancaire), la note vocale et l'insight IA hebdomadaire. Les prix sont affichés clairement et sans surprise. Sans engagement, annulez en deux taps.

Crohnicle n'est pas un dispositif médical et ne remplace pas un avis médical. Les scores et tendances sont des auto-évaluations à visée informative. En cas de symptôme préoccupant, consultez un professionnel de santé.
```

- [ ] Capture screenshots on a device build: meal photo scan (Draft + confidence),
      the doctor PDF export, the Home ring, Tendances (curves + associations).
- [ ] Ask for an App Store review **after the first successful PDF export** (already
      wired — a real moment of value, not mid-onboarding).
