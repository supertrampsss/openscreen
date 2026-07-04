# Crohnicle — Product audit vs spec

Honest coverage of the product bible (§4 onboarding, §5 screens, §8 monetisation)
against the shipped code. Legend:

- ✅ **Done** — implemented and covered by tests / E2E where relevant.
- ⚠️ **Deferred** — implemented behind an abstraction or as documented roadmap;
  needs a **dev build**, real store accounts, or a deployed Worker to go live
  (see [`RELEASE.md`](./RELEASE.md)). Nothing here blocks the app from running.

Verification snapshot (this commit): lint 0 errors · `tsc` clean · **238 unit
tests** · i18n FR/EN in sync (11 namespaces) · web export OK · **Playwright 12/12**
(11 spec files) · `expo-doctor` 18/20 (2 network-only checks) · `git grep electron`
empty.

---

## §4 — Onboarding funnel (~16 screens)

`app/onboarding/index.tsx` (`TOTAL = 16`, steps 0–15), `src/features/onboarding/*`.
E2E: `e2e/onboarding.spec.ts`.

| # | Screen | Status | Reference |
| - | ------ | ------ | --------- |
| 1 | Splash + scan "magic" intro | ⚠️ | `StepIntro` + `ScanAnimation.tsx` animate the scan; a real 6 s capture **video** is an asset task |
| 2 | Diagnosis (Crohn/RCH/IBD-U/undiagnosed) | ✅ | step 1 → `profile.diagnosis` |
| 3 | Diagnosis year | ✅ | step 2, `YearPicker.tsx` |
| 4 | Flare state (sets tone + streak grace) | ✅ | step 3 → `profile.flareStatus` |
| 5 | Typical stool frequency | ✅ | step 4 → `profile.baselineStools` |
| 6 | Bothersome symptoms (multi) | ✅ | step 5 |
| 7 | Current treatment (+ cadence) | ✅ | step 6 → `treatment_reminder_weeks` |
| 8 | Proof interstitial + mini-graph | ✅ | step 7, `ProofChart.tsx` |
| 9 | Goals (multi) | ✅ | step 8 |
| 10 | Obstacles | ✅ | step 9 |
| 11 | Attribution | ✅ | step 10 |
| 12 | Notifications ask (framed useful) | ✅ | step 11, `notif_opt_in` |
| 13 | Apple Health / Google Fit (optional) | ⚠️ | step 12 present & skippable; the native Health read/write needs a dev build (§10 RELEASE) |
| 14 | Animated "building your profile" | ✅ | step 13, `CalcChecklist.tsx` |
| 15 | "Your plan is ready" recap | ✅ | step 14 |
| 16 | **Soft paywall** (10 free scans, "Continue free" equally prominent) | ✅ | step 15 → `PremiumPaywall` |

Review-prompt timing (§4/§7): asked **after the first successful PDF export**, not
mid-quiz — ✅ `app/export.tsx`.

## §5 — Product screens

### 5.1 Home ✅ — `app/(tabs)/index.tsx`, `e2e/home.spec.ts`
Streak flame (documented days), `WeekStrip`, hero `RingCard` (day completeness, not
calories) with baseline "your normal", 3 mini-cards, swipe page 2 (HBI/SCCAI
sparkline + blood/urgency), "Recently logged" feed, floating "+" → 5-action sheet.

### 5.2 Quick stool ✅ — `src/features/log/StoolSheet.tsx`
Bottom-sheet, Bristol 1–7 (default = last used), optional urgency/blood/pain,
time chips, autosave per tap. E2E: 3-tap log in `e2e/home.spec.ts`,
kill-mid-entry recovery in `e2e/persistence.spec.ts`.

### 5.3 Symptoms ✅ — `src/features/log/SymptomSheet.tsx`
Wellbeing 0–4 (HBI labels), pain 0–3 (+ zone), fatigue, extra-intestinal chips,
collapsed notes. Same draft rules.

### 5.4 Meal photo scan ✅ — `app/(tabs)/index.tsx` + `MealScanResultSheet.tsx`, `services/mealScanService.ts`, `e2e/scan.spec.ts`
Background analysis with shimmer, `DraftSheet` with dish name + ingredients +
per-ingredient trigger chips + **confidence shown** + portion S/M/L, "Corriger"
(re-analyse), swipe-remove / search-add, **never a silent failure** (typed
`ScanError` → explicit fallbacks), offline/quota → manual with photo attached.
⚠️ Real **camera capture** runs on device (web uses gallery); the Worker must be
deployed for live analysis (demo mode otherwise).

### 5.5 Manual meal ✅ — `src/features/log/MealSheet.tsx`, `e2e/meals.spec.ts`
Recents one-tap re-log, FR food search (~300 seeded, `src/data` + `domain/foods.ts`),
custom food creation, portions.

### 5.6 Journal ✅ — `app/(tabs)/journal.tsx`
`SectionList` grouped by `local_date`, day badges, filters, soft delete + undo,
flare banner (lightens UI + freezes streak).

### 5.7 Trends ✅ — `app/(tabs)/trends.tsx`, `e2e/trends.spec.ts`
HBI/SCCAI card (auto per profile, pale bands, `null` on missing data), stool/pain/
fatigue curves (in-house SVG `LineChart`/`Sparkline`), food-association card with
statistical guardrails + "X days to go" countdown, local weekly digest, and the
**weekly AI insight** card (§7, below). Complications chips edit `daily_extras`.

### 5.8 Doctor export ✅ (free for life) — `app/export.tsx`, `domain/exportHtml.ts` + `consultPoints.ts`, `e2e/export.spec.ts`
Period 1/3/6 months, preview, PDF (expo-print → share), deterministic inline SVG
curve, weekly tables, adherence, rule-based "3 points for your gastro", disclaimer.
Snapshot-tested HTML.

### 5.9 Treatments ✅ — `app/treatments.tsx`, `domain/treatments.ts`, `e2e/treatments.spec.ts`
Long-cycle biologic reminders (1–8 weeks, auto re-schedule), adherence, side
effects. (Spec listed V2 — shipped.)

### 5.10 Toilets & emergency ✅ — `app/(tabs)/toilets.tsx`, `app/urgence.tsx`, `services/toiletsService.ts`, `e2e/urgence.spec.ts`
Multilingual full-screen emergency card (FR/EN/ES/DE/IT), nearby toilets via
Overpass/OSM, link to the afa card. (Spec listed V2 — shipped.)

### 5.11 Settings ✅ — `app/(tabs)/settings.tsx`
Profile, notifications (granular), JSON backup/restore, Premium status, privacy
statement, disclaimer, replay onboarding, hidden dev premium toggle (long-press ×5).

### 5.12 Widgets & quick actions ⚠️ — `services/quickActionsService.ts`, `app/log/*`
Quick actions (long-press icon → Quick stool / Meal photo / Emergency) + `crohnicle://`
deep links are wired (`expo-quick-actions`); they surface only on a **dev build**.
Home-screen / lock-screen **widgets** need a native widget extension → roadmap
(§9 RELEASE).

### Voice note (§5.4 pipeline, §6.1) ✅ — `src/features/log/VoiceNoteSheet.tsx`, `domain/voiceEntries.ts`, `services/voiceService.ts`, `server/`, `e2e/voice.spec.ts`
Premium. On-device STT (system keyboard dictation is the primary, dependency-free
path; optional Web Speech mic on web) → text only to `/parse-voice` → common
`DraftSheet` review → commit. ⚠️ A dedicated **native STT module** (beyond keyboard
dictation) would need a dev build; **no audio is ever uploaded** either way.

### Weekly AI insight (§7) ✅ — `src/features/trends/WeeklyInsightCard.tsx`, `domain/insightAggregates.ts`, `services/weeklyInsightService.ts`, `server/`
Premium (non-premium → discreet teaser). **Anonymous aggregates only** — the shape
is enforced by a **contractual privacy test** (`insightAggregates.test.ts`): no free
text, no precise dates. ⚠️ Live generation needs the deployed Worker (demo fallback
otherwise).

## §8 — Monetisation (ethical freemium)

| Requirement | Status | Reference |
| ----------- | ------ | --------- |
| Free forever: logs, journal, trends, HBI/SCCAI, correlations, **export**, backup | ✅ | commitment banner in `PremiumPaywall` |
| Premium entitlement `premium` (unlimited scans, voice, weekly insight) | ✅ | `services/entitlements.ts` |
| Prices shown **early and fixed** (4,99 €/mo · 29,99 €/yr) | ✅ | `e2e/premium.spec.ts` asserts both prices on open |
| "Continue free" as prominent as "Try Premium" (onboarding) | ✅ | step 15 paywall |
| **No second purchase flow after refusal** | ✅ | `e2e/premium.spec.ts` asserts no re-prompt on close |
| Human refund email in settings | ✅ | `SUPPORT_EMAIL` in `branding.ts` |
| **RevenueCat billing** | ⚠️ | mock provider by default; real SDK is a written-but-commented skeleton needing a **dev build + store accounts** (§1 RELEASE) |

## Cross-cutting (§2 laws)

- **Zero friction** ✅ — photo/voice/manual converge on the common draft→confirm sheet.
- **Zero data loss** ✅ — SQLite WAL, per-tap autosave (`upsertDraft`), soft deletes,
  1-tap JSON backup; `persistence.spec.ts` proves reload survival.
- **Never anxiety-inducing** ✅ — streak grace in flare, no alarmist red, FR copy
  pass clean (grep of culpabilising/alarmist terms — none).
- **Structural privacy** ✅ — health data on-device; proxy stores nothing; images
  never uploaded for text/voice; the anonymous-aggregate test is contractual.

## Summary

Fully ✅ across §4/§5/§8 except the items that intrinsically require a **dev build,
store accounts, or a deployed Worker** — all implemented behind clean abstractions
or documented as roadmap, none blocking local use:

- ⚠️ Onboarding scan **video** (asset) and Apple Health/Fit **native** connection.
- ⚠️ Home-screen **widgets** (quick actions done; widgets need a native extension).
- ⚠️ **RevenueCat** real billing (mock provider live; skeleton ready).
- ⚠️ **Worker deployment** (demo mode local) and a dedicated **native STT** module
  (keyboard dictation works everywhere today).
