# Deploying the Crohnicle AI proxy (Cloudflare Worker)

The photo-scan feature (§5.4, §6) talks to a small Cloudflare Worker in [`server/`](../server),
never to Anthropic directly. The Worker keeps the `ANTHROPIC_API_KEY` off the device,
enforces the trial quota, and (optionally) checks a RevenueCat `premium` entitlement.

**The app runs without it.** If `EXPO_PUBLIC_AI_PROXY_URL` is unset, the app falls
back to a local **demo mode** (a simulated result, clearly labelled). Deploy the
Worker only when you want real analysis.

---

## 0. Prerequisites

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up).
- An [Anthropic API key](https://console.anthropic.com/).
- Node 22 + `npx` (the repo already pins Node 22).
- _Optional:_ a RevenueCat project + REST API key (only needed once Premium ships in Phase 6).

The `server/` folder is an **independent npm package** (its own `package.json`,
`tsconfig`, tests). It is not bundled into the app.

```bash
cd server
npm install          # installs wrangler + dev types (network required)
```

`wrangler` will prompt you to log in on first use (`npx wrangler login`).

---

## 1. Create the KV namespace (quota + entitlement cache)

```bash
cd server
npx wrangler kv namespace create QUOTA_KV
```

Wrangler prints an `id`. Paste it into [`server/wrangler.toml`](../server/wrangler.toml),
replacing `PLACEHOLDER_REPLACE_WITH_REAL_KV_ID`:

```toml
[[kv_namespaces]]
binding = "QUOTA_KV"
id = "<the id wrangler printed>"
```

---

## 2. Set the secrets

Secrets are **never** committed. Set them with `wrangler secret put` — you'll be
prompted to paste the value:

```bash
npx wrangler secret put ANTHROPIC_API_KEY      # required
npx wrangler secret put REVENUECAT_API_KEY     # optional — enables entitlement checks
```

Without `REVENUECAT_API_KEY`, every request uses the **10-photo trial quota**
(`TRIAL_QUOTA` in `wrangler.toml`). With it, requests carrying a valid
`entitlementToken` whose `premium` entitlement is active bypass the trial and are
only bounded by `DAILY_CAP` (anti-abuse, 200/day).

The tunables live in `[vars]` of `wrangler.toml` and can be changed without a secret redeploy:

| var           | default | meaning                                   |
| ------------- | ------- | ----------------------------------------- |
| `TRIAL_QUOTA` | `10`    | free photos per anonymous device          |
| `DAILY_CAP`   | `200`   | per-device daily ceiling for subscribers  |

---

## 3. Deploy

```bash
cd server
npm run deploy        # = wrangler deploy
```

Wrangler prints the Worker URL, e.g.

```
https://crohnicle-ai-proxy.<your-subdomain>.workers.dev
```

Smoke-test the route (should return `400 invalid_images`, proving it's live):

```bash
curl -X POST https://crohnicle-ai-proxy.<your-subdomain>.workers.dev/analyze-meal \
  -H 'content-type: application/json' -d '{"deviceId":"test","images":[]}'
```

---

## 4. Point the app at it

Add the URL to the app's environment (`.env` at the repo root, read by Expo):

```
EXPO_PUBLIC_AI_PROXY_URL=https://crohnicle-ai-proxy.<your-subdomain>.workers.dev
```

Rebuild / restart the Expo bundler. The scan flow now sends real photos; the
"Mode démo" banner disappears.

> `EXPO_PUBLIC_*` variables are inlined into the JS bundle at build time — the
> proxy URL is public (it's just a routing endpoint), the API key stays server-side.

---

## Endpoint contract (`POST /analyze-meal`)

Request body:

```jsonc
{
  "images": ["<base64 jpeg>", "<optional 2nd base64 jpeg>"], // 1–2 images
  "userNote": "c'est du couscous, pas du riz",               // optional (the "Corriger" flow)
  "deviceId": "<uuid stored in app settings>",               // required
  "entitlementToken": "<revenuecat app_user_id>"             // optional
}
```

Responses:

| status | body                                          | when                              |
| ------ | --------------------------------------------- | --------------------------------- |
| `200`  | `{ result, remaining, cached }`               | success (`remaining` = trial left, `null` for subscribers) |
| `400`  | `{ error: "invalid_images" \| "missing_device_id" \| "invalid_json" }` | bad request |
| `422`  | `{ error: "refused" }`                        | model declined (`stop_reason: refusal`) |
| `429`  | `{ error: "trial_exhausted" \| "daily_cap", remaining: 0 }` | quota hit |
| `502`  | `{ error: "upstream_error" \| "parse_error" \| "empty_result" }` | Anthropic call failed |

Images are **never stored**; logs contain only status/duration/truncated deviceId.

---

## Tests

The Worker's unit tests run inside the repo-root Vitest suite (`npm run test` at
the repo root already includes `server/**/*.test.ts`). To run just the Worker's
own suite:

```bash
cd server
npm test          # schema validity, frozen-prompt snapshot, quota, entitlement, stop_reason, CORS
npm run typecheck
```
