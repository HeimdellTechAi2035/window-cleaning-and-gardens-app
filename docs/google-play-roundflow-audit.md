# RoundFlow — Google Play Readiness Audit

**Audit date:** 5 August 2026
**Auditor:** Claude (Sonnet 5), audit-only pass — no code, config, data, or infrastructure was changed to produce this report.
**Product:** RoundFlow, owned by Heimdell Tech Ai Ltd (company no. 16478408). First live tenant: GreenFix Exterior Care (a customer of the software, not its owner).
**Target:** New Android app submitted after 31 August 2026 → must target Android 16 / API level 36+.

**Scope note:** This audit inspected the repository at `c:\Users\Heimd\Desktop\window cleaning and gardening app`, ran `eslint`, `tsc --noEmit`, `next build`, and `npm audit` locally (no deploys triggered), and read the Prisma schema, auth code, legal pages, and a representative sample of routes/components. It does not include a live device test, a formal accessibility audit tool run, or a full line-by-line review of every server action in the codebase — items requiring that are labeled **REQUIRES MANUAL CONFIRMATION** throughout.

---

## 1. Executive Summary

RoundFlow is a genuinely well-built, actively-tested multi-tenant SaaS product — Next.js 15 / React 19 / Prisma / PostgreSQL, already running in production on Netlify, with a real installable PWA (working manifest, service worker, Web Push) that was built and live-tested extensively in the sessions leading up to this audit. That is a strong starting position for Android packaging: RoundFlow does not need to be built for mobile — it needs to be **wrapped**.

Two things stand between this project and a safe Google Play submission, and neither is architectural:

1. **No account-deletion path exists at all** — not in-app, not on the web. This is a direct, named Google Play policy requirement for any app that supports account creation, and RoundFlow has account creation (self-serve signup) but no corresponding deletion route anywhere.
2. **New signups hit a real-money Stripe paywall before reaching the app.** A Google reviewer creating an account through the normal flow would be asked for a card before seeing any actual functionality, unless a super-admin manually grants access first (which is possible today, see §4).

Beyond those two, this audit also surfaced a **previously-unknown functional bug**: inviting a team member (Settings → Team) creates a user with no password set and no invite email sent — that person can never log in. This isn't a Play-specific issue, but a reviewer exploring "Team" would find it broken, and it's worth fixing regardless of the Play submission.

Everything else — the data model, tenant isolation, the legal pages, the lack of tracking/analytics, the deliberately separate admin system — is in good shape and reads as the work of someone who has been paying attention to this exact set of concerns already.

---

## 2. Current Architecture

All items below are **VERIFIED** by direct inspection of the repository unless marked otherwise.

| Area | Finding |
|---|---|
| Framework | Next.js **15.5.21** (App Router), React **19.0.0** |
| Language | TypeScript 5.7, strict mode build passes clean |
| Database | PostgreSQL, hosted on **Neon**, via `@prisma/client` **6.19.3**. Pooled connection (`DATABASE_URL`) at runtime, direct connection (`DATABASE_URL_UNPOOLED`) for migrations only |
| Authentication (tenant app) | `next-auth` **5.0.0-beta.32** — Credentials provider (email + bcrypt password) as the only always-on method. Google OAuth and Resend magic-link email are both wired but **environment-gated** (only activate if their env vars are set) |
| Authentication (admin app) | A **deliberately separate**, hand-rolled system (`lib/admin-auth.ts`) — HMAC-SHA256-signed cookie, no NextAuth, no shared session with tenant users. Built this way specifically to prevent any tenant account from ever reaching `/admin` |
| Hosting | Netlify, via `@netlify/plugin-nextjs`. Build command: `prisma generate && prisma migrate deploy && next build` |
| Deployment topology | **One codebase, two live origins**: the `main` branch → `greenfixapp.netlify.app` (production), and an `admin` branch (kept as a mirror of `main`) → `admin--greenfixapp.netlify.app`, a Netlify **branch deploy** of the identical app. Not two separate builds/repos — the split is a git-branch + hostname trick, not a real second deployment pipeline |
| PWA manifest | One file, `app/manifest.ts`, serving **two different manifests from the same URL** depending on the request's `Host` header — the tenant app manifest (`start_url: /dashboard`, scope `/`) for the main domain, and a separate dark-themed admin manifest (`start_url: /admin`, scope `/admin`, `lib/admin-manifest.ts`) for the admin host. Both were live-tested and confirmed installable as visually distinct home-screen icons in the sessions preceding this audit |
| Service worker | `public/sw.js`, registered globally via `components/service-worker-registration.tsx`. Deliberately narrow: caches only content-hashed static assets and icons (network-first for everything else — no stale job/price/payment data risk). Also handles `push` and `notificationclick` events |
| Push notifications | Web Push API (VAPID), `lib/push.ts`. `PushSubscription` table is tied **only** to `PlatformAdmin` — this is currently an **admin-only** feature ("a new company signed up"), not yet used for any tenant-facing notification (e.g. job reminders) |
| Main app structure | `app/(auth)` [login, register] · `app/(dashboard)` [dashboard, planner, rounds, customers, route-map, financials, settings] · `app/portal/[token]` [public, token-based client self-service page, no login] · `app/billing` [subscribe, success] · `app/legal` [terms, privacy, cookies] |
| Admin app structure | `app/admin` [organizations list + detail], `app/admin-login`, `app/admin-bootstrap` — fully separate auth, fully separate branding, served from the separate origin above |
| Existing Android wrapper | **NOT FOUND.** No `android/` directory, no Capacitor config, no Bubblewrap/TWA project, no `applicationId`, no Android package identifier anywhere in the repository |
| Capacitor / TWA / Bubblewrap tooling | **NOT FOUND** in `package.json` dependencies or anywhere in the tree |

---

## 3. Google Play Readiness Score: **42 / 100**

This reflects a genuinely strong technical foundation (PWA quality, tenant isolation, clean build, honest legal pages) pulled down hard by two named-policy compliance gaps that block submission outright, plus one real functional bug and a cluster of mobile-experience polish items. The score is not a reflection of code quality — it's a reflection of distance from "ready to submit."

## 4. Release Recommendation: **NOT READY**

Not ready to submit today. With the critical blockers in §5 addressed — which are scoped, well-understood fixes, not architectural rework — this becomes **READY WITH CONDITIONS** fairly quickly. Nothing found in this audit suggests a fundamental rebuild is needed.

---

## 5. Critical Blockers (must fix before submission)

### 5.1 No account-deletion route — in-app or web
- **Severity:** Critical — blocks submission
- **Evidence:** Exhaustive search for `delete-account`, `deleteAccount`, "delete my account" and equivalent patterns across `app/`, `components/`, `lib/` returned zero matches. The only deletion capability in the entire codebase is `deleteOrganizationAsAdminAction` (`app/actions/super-admin.ts`), which is a **cross-tenant platform-admin tool**, not something a business owner or their staff can trigger themselves.
- **Why it matters:** Google Play's User Data policy requires any app supporting account creation to provide both an in-app deletion path and a publicly reachable web deletion request page, since 2023. RoundFlow has self-serve account creation (`/register`) with no corresponding deletion route of either kind.
- **Recommended correction:** Two pieces — (a) an in-app "Delete my account / organization" action reachable from Settings, gated to org ADMIN, that either hard-deletes or triggers a supported deletion request; (b) a public, unauthenticated page (e.g. `/legal/delete-account`) that lets someone request deletion by email without needing to log in first (for the case where they've lost access). Both must be reachable and linked from the Play Store listing.
- **Blocks submission:** **Yes.**

### 5.2 New signups hit a real Stripe paywall before reaching any functionality
- **Severity:** Critical — blocks a clean reviewer experience
- **Evidence:** `app/(dashboard)/layout.tsx` redirects any organization whose `subscriptionStatus` is not `trialing` or `active` to `/billing/subscribe`, which requires a completed Stripe Checkout (real card details collected, even for the 7-day trial) before granting access. New orgs default to `subscriptionStatus: "incomplete"` (`prisma/schema.prisma`).
- **Why it matters:** A Google reviewer who registers an account the normal way is asked to enter payment card details before seeing a single real screen of the app. This is a strong minimum-functionality / deceptive-access risk during review, independent of whether it's also a bad first impression for a real prospective customer.
- **Recommended correction:** Not a code change — see §6 for the specific reviewer-account workaround using the existing platform-admin subscription-status override. For the Play submission itself, this must be operationally handled (a super-admin grants the reviewer account `active` status before submitting for review) rather than fixed in code, unless the business wants a genuinely free/unlocked demo tier added later.
- **Blocks submission:** **Yes, unless handled per §6 before the review is submitted.**

---

## 6. High-Priority Issues

### 6.1 Inviting a team member creates a permanently locked-out user
- **Severity:** High
- **Evidence:** `app/actions/organization.ts:92-110` — `inviteTeamMemberAction` calls `prisma.user.create()` with no `passwordHash` field set at all, and sends no invite email. `lib/auth.ts:45` — the Credentials `authorize()` function explicitly requires `user.passwordHash` to be truthy (`if (!user || !user.passwordHash || !user.isActive) return null`). A user created with a null password hash can **never** sign in via the normal login form.
- **Why it matters:** This is a real, currently-shipping bug, not specific to Android — anyone using "Invite" in Settings → Team today creates a colleague who is silently unable to log in, with no error shown to either party. A reviewer testing this feature (a natural thing to try) will find it broken.
- **Recommended correction:** Either generate a temporary password and email it (reusing the existing `resetUserPasswordAsAdminAction` temp-password pattern from `app/actions/super-admin.ts`), or implement a proper invite-token + "set your password" flow.
- **Blocks submission:** Not directly, but a reviewer hitting this during exploration is a real risk to a smooth review.

### 6.2 No self-service password reset
- **Severity:** High
- **Evidence:** No "forgot password" page or action was found anywhere in `app/(auth)/`. The only password-reset capability in the codebase is the platform-admin's `resetUserPasswordAsAdminAction`, a cross-tenant admin tool — not something a locked-out user can trigger themselves. **REQUIRES MANUAL CONFIRMATION** that this is truly absent rather than named differently, but no evidence of it was found in a thorough search.
- **Why it matters:** Not a hard Play blocker, but a genuine product gap that increases support burden and is worth having fixed before wider distribution.
- **Blocks submission:** No.

### 6.3 No `error.tsx` or `global-error.tsx` anywhere in the app
- **Severity:** High
- **Evidence:** `find app -iname "error.tsx" -o -iname "global-error.tsx"` returned nothing.
- **Why it matters:** Any unhandled error in a Server Component or route falls through to Next's generic default error page — not a branded, graceful recovery screen. In a TWA/installed-app context this reads as a crash, which is exactly the kind of "broken experience" Play's pre-launch report flags.
- **Recommended correction:** Add at minimum a root `app/error.tsx` and `app/global-error.tsx`.
- **Blocks submission:** Not directly, but a real risk factor for the pre-launch report.

### 6.4 Per-organization Stripe/GoCardless credentials stored as plain-text DB columns
- **Severity:** High (security, not Play-specific)
- **Evidence:** `prisma/schema.prisma:91-95` — `Organization.stripeSecretKey`, `gocardlessAccessToken`, `stripeWebhookSecret`, `gocardlessWebhookSecret` are plain `String?` columns with no application-layer encryption.
- **Why it matters:** These are live payment-processing API keys. The privacy policy claims "industry-standard measures" but does not specifically claim encryption at rest for these fields, and whether Neon provides transparent at-rest encryption for the underlying volume is **REQUIRES MANUAL CONFIRMATION** (check Neon's own documentation/plan).
- **Recommended correction:** Confirm Neon's at-rest encryption coverage, and/or add application-layer encryption (e.g. via a KMS-backed envelope encryption) for these specific columns given their sensitivity.
- **Blocks submission:** No, but worth resolving before scaling beyond the first tenant.

---

## 7. Medium-Priority Issues

| # | Finding | Evidence | Why it matters |
|---|---|---|---|
| 7.1 | No `loading.tsx` for any data-heavy route except `app/billing/success/loading.tsx` | `find app -iname loading.tsx` — one result | Dashboard, Customers, Rounds, Planner, Financials, Route Map, Settings, and both `[id]` detail pages show no loading indicator during Server Component data fetches — risk of a perceived frozen/blank screen on slower mobile connections |
| 7.2 | 6-item bottom navigation bar with 11px labels | `components/layout/bottom-nav.tsx`, `components/layout/nav-items.ts` | Material/HIG guidance generally recommends ≤5 items in a bottom tab bar; 6 equal-width items plus small text risks cramped tap targets on smaller phones. **REQUIRES MANUAL CONFIRMATION** on an actual small device |
| 7.3 | No hardware back-button handling for modals/dialogs | No `popstate`/history-state code found anywhere; dialogs (`components/ui/dialog.tsx`) are Radix-based and don't push history entries | On Android (TWA), the hardware back button typically navigates browser history rather than closing an open dialog, since the dialog never changed the URL. Common PWA/TWA gap, not unique to this app, but **REQUIRES MANUAL CONFIRMATION** on a real device once packaged |
| 7.4 | Job photos stored as base64 strings directly in Postgres, not as separate files/blobs | `Job.beforePhotoUrl`/`afterPhotoUrl` are plain `String?` columns; `components/planner/complete-job-dialog.tsx` client-side compresses and stores a `data:image/jpeg;base64,...` URL directly | Bloats the database with binary-as-text data; the client-side compression step exists specifically because uncompressed photos were hitting the Server Action payload limit — a structurally fragile pattern, though currently mitigated. Not a Play blocker |
| 7.5 | `next.config.mjs` declares `remotePatterns` for Supabase/AWS/Cloudinary, but `next/image` is never used anywhere in the codebase | Grep for `next/image` only matched an unrelated path exclusion in `middleware.ts` | Dead configuration; all images render via plain `<img>` tags. Not a bug, just unused config worth removing for clarity |
| 7.6 | Privacy policy doesn't mention push-notification token collection | `app/legal/privacy/page.tsx` §2 "What we collect" — no mention of `PushSubscription` data | Should be added even though the feature is currently admin-only; it is real data collection today |
| 7.7 | Privacy policy doesn't address a native/Android app context | Same file — written entirely in "the Service" web-app language | Should be updated once the Android app is live to reference Play Store use, and ideally cross-reference the eventual Data Safety declaration |
| 7.8 | `npm audit` reports 3 high-severity transitive vulnerabilities (postcss/sharp, via `next`) | `npm audit --omit=dev`, run this session | Fix requires a breaking Next.js 16.x upgrade — track separately, not urgent, not exploitable in this app's actual usage pattern (build-time deps) |

---

## 8. Low-Priority Improvements

- Remove the unused `remotePatterns` block in `next.config.mjs` (§7.5), or start actually using `next/image` for real optimization.
- Add a data-export ("download my data") feature — not found anywhere in the app; nice-to-have for GDPR completeness even though not strictly Play-required.
- Consider anonymizing (rather than hard-deleting) `Transaction`/invoice records on account deletion, to reconcile the immediate cascade-delete behavior with UK 6-year tax-record retention norms — currently everything cascades away instantly with no retention step (see §15).
- No unit or integration test suite exists (`npm test` → `Missing script: "test"`, no `.test.ts`/`.spec.ts` files anywhere). Not a Play blocker, but worth flagging given the size of the codebase.

---

## 9. Confirmed Google Play Declaration Information

Facts below are safe to use directly when filling in Play Console forms, because they were verified against the actual running app/code, not inferred.

- **Legal developer entity:** Heimdell Tech Ai Ltd, company number 16478408, registered office Croft, Preston, PR1 9DJ, ICO registration ZC079121.
- **Support contact:** `admin@heimdell-tech-ai.co.uk` (used consistently across all three legal pages).
- **Privacy policy URL (once hosted at production path):** `https://greenfixapp.netlify.app/legal/privacy` (or the eventual production domain equivalent).
- **No advertising or analytics trackers are used** — the privacy policy states this explicitly and it is corroborated by the dependency list (no Google Analytics, Mixpanel, PostHog, Segment, Facebook Pixel, or similar found in `package.json`).
- **No AI integrations exist in this codebase** — no OpenAI/Anthropic/AI SDK dependency found anywhere.
- **Named third-party processors** (verified consistent between the privacy policy and actual dependencies): Stripe, GoCardless, Twilio, Resend, Netlify, Neon, OpenStreetMap/Nominatim.
- **Cookies used:** exactly two purposes — session sign-in and CSRF protection — both strictly necessary, no consent banner required under UK PECR, none currently set for tracking/marketing.

## 10. Information Still Requiring Andy's Answer

- Does Heimdell want the Android app to allow **new business self-signup** (requiring a Play Billing integration eventually), or should it launch **login-only for existing subscribed businesses** (recommended, see §17)?
- Confirm whether Neon's plan/tier provides at-rest encryption for the database volume (relevant to §6.4).
- Decide the account-deletion policy: immediate hard delete, or a retention window for invoice/tax records before erasure (relevant to §6.1 and §15)?
- Confirm the exact production domain the Android app will point at (currently `greenfixapp.netlify.app` — is a custom domain planned before launch?).
- Preferred package name from the three options in §12.
- Who will hold/manage the Play Console "Heimdell Tech Ai Ltd" organisation account and the Android upload keystore?

---

## 11. Recommended Android Packaging Approach

**Recommendation: Trusted Web Activity (TWA), built via Bubblewrap.**

| Option | Verdict |
|---|---|
| A. Capacitor | Not recommended — would require maintaining a genuinely separate native project/build pipeline for functionality the existing PWA already provides (camera via file input, push via Web Push). Real value only if a feature needing a true native-only API (background location, Bluetooth, biometrics) is planned — none currently is |
| **B. Trusted Web Activity** | **Recommended** |
| C. Native Android | Not recommended — would mean rebuilding the entire UI a second time for a server-rendered CRUD/scheduling app. Wildly disproportionate |
| D. Basic WebView wrapper | **Not recommended, and not needed.** RoundFlow already has real app-like behavior (installable, offline app-shell, push notifications, native camera hand-off, `tel:`/`sms:` deep links) — wrapping it in a bare WebView would *throw away* functionality the PWA already has, and risks exactly the "minimum functionality"/shell-app rejection this audit is trying to avoid |

**Why TWA is the best fit here specifically:**
- RoundFlow's PWA is unusually complete already — a real manifest, a working service worker, and Web Push were all built and live-tested in the sessions immediately preceding this audit. TWA is Google's own sanctioned path from "good PWA" to "Play Store app," and this project is better-positioned for it than most.
- Camera access already uses the browser-native `<input type="file" capture="environment">` pattern (`components/planner/complete-job-dialog.tsx`), which works inside a TWA exactly as it does in Chrome — no native camera plugin needed.
- Push notifications already use the standard Web Push API, which Chrome delegates to real Android system notifications inside a TWA automatically.
- It requires **no changes to the existing Next.js application code** beyond one small addition: hosting a `/.well-known/assetlinks.json` file that links the Android package to the web origin (Digital Asset Links verification). Everything else (the Android project itself) is generated by Bubblewrap from the existing manifest and lives outside this repository's web code.

**What it supports:** full-screen app experience (no browser chrome, once Digital Asset Links verify), the existing install icon/branding, push notifications via real Android notifications, camera hand-off, offline app-shell via the existing service worker.

**What it would require:** (future phase, not this audit) — an `assetlinks.json` file on the production domain; running Bubblewrap to generate an Android Studio project; a Play App Signing upload keystore; a version name/code scheme.

**Google Play risks it reduces:** avoids the "minimum functionality"/bare-WebView-wrapper rejection category (TWA is explicitly not treated as a WebView wrapper by Play policy); avoids maintaining a second, driftable native codebase.

**Limitations it creates:** genuinely native-only APIs (background location, Bluetooth pairing, biometric hardware beyond WebAuthn) would not be available without a later move to Capacitor/native — but nothing in the current app uses or implies needing those.

**Does it provide enough value beyond "just a website"?** Yes. It is an installable, app-shell-capable, push-notification-capable business tool with real mobile-specific interaction patterns (bottom tab navigation, camera-driven job completion, native SMS hand-off) already built and tested — this is not a thin marketing-site wrapper.

## 12. Proposed Package Name Options

No existing package identifier was found anywhere in the repository (**VERIFIED, NOT FOUND**) — this is a clean slate. Not registered by this audit, per instructions.

1. `uk.co.heimdelltechai.roundflow` **(preferred)** — clearly ties the app to the legal entity's own domain (`heimdell-tech-ai.co.uk`), unambiguous ownership, room to add sibling apps later (`uk.co.heimdelltechai.<otherproduct>`).
2. `com.heimdelltechai.roundflow` — simpler `.com`-style form if a `.com` domain is preferred going forward.
3. `com.roundflowapp.android` — product-first naming, useful if RoundFlow is ever spun out as its own brand independent of Heimdell, but weaker ownership signal today.

---

## 13. Data Inventory

Built from the Prisma schema (`prisma/schema.prisma`), the third-party SDKs in `package.json`, and the code paths that write each field.

| Data type | Collected where | Why | Mandatory? | Stored | In transit | At rest | Shared with | User-deletable? | Retention | Play Data Safety? |
|---|---|---|---|---|---|---|---|---|---|---|
| Name (staff) | `/register`, Settings → Team | Account identification | Mandatory | `User.name` (Postgres) | HTTPS (Netlify TLS) | **REQUIRES MANUAL CONFIRMATION** (Neon volume encryption) | None externally | No self-service (§6.1) | Indefinite / until org deleted | Yes — declare |
| Email (staff) | `/register`, Team invite | Login identifier | Mandatory | `User.email` (unique) | HTTPS | Same as above | Resend (if magic-link enabled), NextAuth internally | No | Indefinite | Yes |
| Phone (staff) | User profile (optional) | Contact | Optional | `User.phone` | HTTPS | Same | None | No | Indefinite | Yes |
| Password | `/register` login form | Auth | Mandatory | `User.passwordHash` — **bcrypt hashed**, never stored plain | HTTPS | Hash only | None | No | Indefinite | Yes (as "password" data type) |
| Business info | `/register`, Settings | Org identity | Mandatory | `Organization.name/slug/timezone` | HTTPS | Same | None | No | Indefinite | Yes |
| Customer name/email/phone | Customers → Add customer | Core product function | Mandatory (name), optional (email/phone) | `Customer.*` | HTTPS | Same | Twilio (SMS), Resend (email), if configured per-org | Customer records deletable by the org admin (cascades, §15) | Until org/customer deleted | Yes |
| Customer billing address | Customer form | Invoicing | Optional | `Customer.billingAddress*` | HTTPS | Same | Stripe/GoCardless (per-org, if payment taken) | Same as above | Same | Yes |
| Job/property address | Property form | Route planning | Mandatory | `Property.addressLine1/2, city, postcode` | HTTPS | Same | OpenStreetMap/Nominatim (address text only, for geocoding) | Same as above | Same | Yes |
| Approximate location | Derived automatically from typed address | Route map | Automatic (not device GPS) | `Property.latitude/longitude` (`Float?`) | HTTPS | Same | Nominatim (address text sent for geocoding, not stored coordinates) | Same as above | Same | Yes — "approximate location," not precise/device location |
| Photographs | Job completion (`complete-job-dialog.tsx`) | Before/after proof of work | Optional | `Job.beforePhotoUrl/afterPhotoUrl` — **base64 data URL stored directly in the row**, not a separate file/bucket | HTTPS | Same as row (no separate encryption) | None | Deleted when the Job row is deleted (no orphaned file risk, since there's no separate file) | Until job/org deleted | Yes — "photos" |
| Job records | Planner / job completion | Core function | Mandatory | `Job.*` | HTTPS | Same | None directly (drives Transaction/Notification) | Cascades with org/property (§15) | Until deleted | Yes — "app activity"-adjacent |
| Worker records | Team invite | Job assignment | Mandatory (for assigned workers) | `User` with role `OPERATIVE` | HTTPS | Same | None | No self-service (§6.1) | Indefinite | Yes |
| Quotes | N/A — no distinct "quote" concept; `Service.price` acts as the agreed price | — | — | `Service.price` | HTTPS | Same | None | Cascades with property | Until deleted | Yes (financial info) |
| Invoices | Auto-generated on payment (`generateInvoiceNumber()`) | Billing record | Automatic | `Transaction.invoiceNumber/invoicePdfUrl` | HTTPS | Same | None (PDF URL field exists but no PDF-generation code was found — **REQUIRES MANUAL CONFIRMATION**) | Cascades with customer (§15) — **no legal-retention step currently** | Until deleted | Yes |
| Payment information | Checkout via Stripe/GoCardless | Take payment | Optional (per customer's chosen method) | **Tokenized references only** (`stripeCustomerId`, `stripeDefaultPaymentMethodId`, `gocardlessMandateId`) — full card/bank numbers are never stored, held only by Stripe/GoCardless directly | HTTPS | N/A (tokens only) | Stripe, GoCardless | Cascades with customer | Until deleted | Yes — "financial info" |
| Messages | SMS/email notifications | Job/payment updates | Automatic | `Notification.body/recipient` | HTTPS (to Twilio/Resend), SMS itself carried by Twilio | Same | Twilio, Resend | Cascades with customer | Until deleted | Yes |
| The worker's manual "job done" text | `complete-job-dialog.tsx` — opens the worker's own native Messages app via an `sms:` URI | Personal touch, no provider involved | Optional | **Not stored server-side at all** — this specific message is composed and sent from the worker's own phone, RoundFlow never sees its content | N/A | N/A | None (goes directly device-to-device via the carrier) | N/A | N/A | Likely not declarable — RoundFlow never processes this message |
| Notifications (system) | Automated job/payment events | Keep customers informed | Automatic | `Notification.*` | HTTPS | Same | Twilio, Resend | Cascades with customer | Until deleted | Yes |
| User IDs | Every table | Internal referencing | Automatic | `cuid()` strings throughout | N/A | N/A | None | N/A | N/A | Yes — "device or other IDs" is *not* the right category; these are account IDs |
| Device identifiers | **NOT FOUND** — no device fingerprinting code anywhere | — | — | — | — | — | — | — | — | Not applicable |
| App activity / diagnostics / crash logs | **NOT FOUND** — no analytics or crash-reporting SDK in `package.json` (no Sentry, Firebase Crashlytics, etc.) | — | — | — | — | — | — | — | — | Not applicable today |
| Analytics | **NOT FOUND** — privacy policy explicitly states none are used, corroborated by dependency list | — | — | — | — | — | — | — | — | Not applicable |
| Cookies | NextAuth session + CSRF, admin session (`admin-auth.ts`) | Keep users signed in securely | Mandatory (for staying signed in) | Browser cookie jar | HTTPS, `httpOnly`+`secure` flags confirmed on the custom admin cookie; NextAuth's own cookies use its library defaults (**REQUIRES MANUAL CONFIRMATION** of exact flags in this NextAuth v5 beta) | N/A (client-held) | None | Cleared on sign-out | Session length / 30 days | Yes |
| Local storage | Theme preference (light/dark/system) via `ThemeProvider` | UI preference | Optional | Browser `localStorage` — **REQUIRES MANUAL CONFIRMATION** of exact key name, not verified this pass | N/A | N/A | None | Clearable via browser | Indefinite until cleared | Likely not declarable (no personal data) |
| Push-notification tokens | Admin "Enable sign-up alerts" button | Notify platform admin of new signups | Optional, admin-only | `PushSubscription.endpoint/p256dh/auth` | HTTPS | Same as other tables | Browser push service (Google/Mozilla's push relay, inherent to the Web Push standard) | Deleted on unsubscribe or 404/410 from the push service | Until unsubscribed | Yes — "device or other IDs" |
| AI integrations | **NOT FOUND** | — | — | — | — | — | — | — | — | Not applicable |

---

## 14. Permission Inventory

Classified strictly against **verified, currently-shipping** functionality. RoundFlow already follows a minimum-permissions pattern well — most "obvious mobile app" permissions are **not justified** because the app deliberately hands off to OS-level pickers/intents instead of requesting the permission directly.

| Permission | Classification | Where in the user journey | Evidence |
|---|---|---|---|
| Camera | **REQUIRED** | At the moment a worker taps "Attach after photo" on the job-completion screen | `components/planner/complete-job-dialog.tsx` — `<input type="file" accept="image/*" capture="environment">`. Browser/TWA-mediated: Chrome prompts for camera access contextually, no permission is pre-declared at app install |
| Photo selection / read media | **REQUIRED** | Same screen — the same file input also allows picking an existing photo | Same file |
| Notifications (`POST_NOTIFICATIONS`, Android 13+) | **REQUIRED** | When a platform admin taps "Enable sign-up alerts" in `/admin` | `components/admin/push-subscribe-button.tsx` — requested on-demand, not at first launch. Currently admin-only usage |
| Precise location | **NOT JUSTIFIED** | — | No `navigator.geolocation`/`getCurrentPosition` call exists anywhere in the codebase (verified by search). Route Map uses server-side geocoding of typed addresses, not device GPS |
| Approximate location | **NOT JUSTIFIED** | — | Same reasoning |
| Background location | **NOT JUSTIFIED** | — | No such feature exists or is implied |
| Microphone | **NOT JUSTIFIED** | — | No audio/voice feature found anywhere |
| Contacts | **NOT JUSTIFIED** | — | No contacts-picker integration; customers are entered manually |
| Telephone (`READ_PHONE_STATE`/`CALL_PHONE`) | **NOT JUSTIFIED** | — | The app uses `tel:`/`sms:` URI hand-offs (`lib/utils.ts` `smsUri` helper) to the device's own dialer/Messages app — these require no special permission |
| SMS (`READ_SMS`/`SEND_SMS`) | **NOT JUSTIFIED** | — | Automated SMS is sent server-side via Twilio, never from the device. The one client-initiated SMS (job-done text) is a deep link into the user's own Messages app, not a programmatic send |
| Broad file storage (`READ/WRITE_EXTERNAL_STORAGE`) | **NOT JUSTIFIED** | — | The file-input photo picker uses Android's Storage Access Framework automatically on modern Android; no broad storage permission is needed on the Android 16/API 36 target this app will ship against |
| Calendar | **NOT JUSTIFIED** | — | No calendar-sync feature exists |
| Biometrics | **NOT JUSTIFIED** | — | Login is plain email + password; no WebAuthn/biometric code found |

**Net result: only Camera and Notifications are justified.** This is a genuinely minimal permission footprint for a field-service app — worth stating plainly in the Play listing.

---

## 15. Privacy and Account-Deletion Assessment

### Legal pages found
- `app/legal/privacy/page.tsx` — Privacy Policy
- `app/legal/terms/page.tsx` — Terms of Service
- `app/legal/cookies/page.tsx` — Cookie Policy
- All three are reachable **without login** (explicitly listed in `middleware.ts`'s `PUBLIC_PATHS`) — **VERIFIED**.
- **No account-deletion page exists** (§6.1).
- **No dedicated support page** beyond the `mailto:` links repeated across the legal pages — **REQUIRES MANUAL CONFIRMATION** whether a dedicated `/support` page is wanted for the Play listing's support URL field, or whether the contact email alone is sufficient.
- **No subscription-terms or refund-policy page** specifically — the Terms of Service §4 covers payments generally but doesn't address refunds for the RoundFlow subscription itself.

### Privacy policy checklist

| Requirement | Status |
|---|---|
| Names RoundFlow | ✅ Yes |
| Names Heimdell Tech Ai Ltd | ✅ Yes, with company number and ICO registration |
| Describes actual data collected | ✅ Yes — genuinely matches the real schema, not generic boilerplate |
| Covers mobile app use | ❌ No — written entirely in general web-app language |
| Covers camera/photo access | ⚠️ Partial — mentions photos as a data type, doesn't address camera *permission* specifically |
| Covers notifications | ❌ No — push tokens aren't mentioned in "what we collect" |
| Covers location | ✅ Yes, and accurately (correctly describes it as address-derived, not device GPS) |
| Names important processors | ✅ Yes — thorough and accurate |
| Explains retention | ⚠️ Partial — general statement only, doesn't address post-deletion legal retention |
| Explains deletion | ⚠️ Partial — covers customer-record deletion by the Account Holder, doesn't cover organization/account-level deletion (because that feature doesn't exist yet) |
| Working contact route | ✅ Yes |
| Publicly accessible without login | ✅ Yes |

### Account creation and deletion

| Capability | Status | Evidence |
|---|---|---|
| Self-serve account creation | ✅ Yes | `app/actions/auth.ts` `registerOrganization` — immediate, no manual approval |
| Admin-created accounts | ⚠️ Broken (§6.2) | `inviteTeamMemberAction` creates a user who can never log in |
| In-app account/org deletion | ❌ **Not found** | Only cross-tenant admin deletion exists |
| Public web deletion request page | ❌ **Not found** | — |
| Delete organisation data | ⚠️ Partial | Cascades correctly (see below) but only reachable by a platform super-admin, not the org itself |
| Delete uploaded photos | ✅ Effectively yes | Photos are embedded in the `Job` row itself (base64), not separate files — deleting the row deletes the photo, no orphan risk |
| Delete customer/worker data | ⚠️ Partial | Customers are individually deletable by an org admin (cascades to properties/jobs/transactions/notifications); workers (Users) have no deletion path found for the org admin to remove one — **REQUIRES MANUAL CONFIRMATION** |
| Export data | ❌ **Not found** | No CSV/JSON export feature anywhere |
| Cancel subscription | ✅ Yes | "Manage billing" (`components/billing/manage-billing-button.tsx`) opens a Stripe-hosted Billing Portal — genuine self-service cancellation |

### Deletion/cascade mechanics (freshly verified this session, via live testing)
- `Organization` deletion now correctly cascades through Users, Customers, Properties, Rounds, Jobs, Services, Transactions, Notifications, and PropertyHazards.
- This was **not always true**: two `ON DELETE RESTRICT` bugs (`Transaction`/`Notification` → `Customer`, and `Job` → `Round`/`Property`/`Service`) were discovered and fixed in the immediately preceding work session, confirmed via a real production delete that failed, was diagnosed, and re-tested successfully after the fix. The current schema (as of this audit) has no known remaining `RESTRICT` constraints — verified by grepping every migration file for `ON DELETE RESTRICT`.
- **No soft-delete logic exists anywhere** — all deletion is a hard, immediate cascade. There is no audit-log table, and no legal-retention step for invoice/payment records before they're erased alongside a deleted organization. In practice this means: if Heimdell deletes a business's account, that business's invoice history (which UK tax law generally expects retained for 6 years) disappears immediately too, with no separate archival step.
- **No orphaned-file risk** — because there is no separate file/blob storage (photos are DB-embedded base64), there is nothing left behind after a row is deleted.

**Play Play compliance verdict for account deletion: NOT COMPLIANT today.** This is §5.1, restated here for completeness.

---

## 16. Reviewer-Access Assessment

| Question | Answer |
|---|---|
| Login identifier | Email + password (Credentials provider). Google OAuth and Resend magic-link are both wired but currently environment-gated/optional |
| CAPTCHA present? | **No** — no CAPTCHA package or code found anywhere |
| OTP / 2FA required? | **No** — no TOTP/SMS-verification code found |
| Password resets work? | **Not found as a self-service feature** (§6.2) |
| Could reviewers be blocked by email verification? | **No** — the `User.emailVerified` field exists on the schema but is never checked in the login `authorize()` function; an unverified email does not block sign-in |
| Rate limiting that could block review? | **Not found** — no app-level throttling on login attempts |
| Geographic/IP restrictions? | **Not found** |
| Can a reviewer reach all important functions? | Yes, once past the paywall (§5.2) — the tenant app (Dashboard, Planner, Rounds, Customers, Route Map, Financials, Settings) has no further gating beyond org membership |
| Must an organisation be manually approved before login? | **No** — registration is immediate and self-serve |
| Can a reviewer account be created safely? | Yes — registration itself is safe and free of any real customer data exposure risk, since it creates a brand-new, empty organisation |
| Can realistic demo data be provided without exposing real GreenFix data? | **Yes, straightforwardly** — a fresh org created via `/register` starts completely empty and fully isolated from GreenFix's own organisation (tenant isolation was extensively rebuilt and tested in the immediately preceding session) |

### Recommended reviewer account structure

1. Register a dedicated organisation through the normal public `/register` flow — e.g. business name "RoundFlow Demo", login email `googleplay-review@heimdell-tech-ai.co.uk`, a password Heimdell controls.
2. **Before submitting for review**, a Heimdell platform-admin logs into `/admin`, finds this new organisation, and manually sets its `subscriptionStatus` to `active` using the existing subscription-status override dropdown (`components/admin/org-edit-form.tsx`) — the exact mechanism already used this session to grandfather test organisations. This bypasses the Stripe paywall with **zero code changes**, since it's an existing, already-shipped admin capability.
3. Populate the demo org with a handful of fictional customers/properties/jobs (e.g. "Test Customer" at a fictional address) so the reviewer sees a working, non-empty Dashboard/Planner/Route Map/Financials rather than all-zero empty states.
4. Do **not** configure real Stripe/GoCardless credentials for this demo org — the Settings page and payment-link features degrade gracefully to a clear "add your Stripe secret key" message rather than erroring, so this is safe to leave blank.

### Draft Play Console "App Access" instructions (proposed, account not created by this audit)

> This app requires a login. Use the following test account:
>
> Email: `googleplay-review@heimdell-tech-ai.co.uk`
> Password: [set by Heimdell at account creation]
>
> No further verification (no CAPTCHA, no OTP, no email confirmation) is required to sign in. The account has full administrator access to a pre-populated demonstration organisation containing fictional customer, property, and job data — no real customer information is present. All core features (scheduling, route planning, customer records, job completion with photo capture, financial summary) are accessible immediately after login.

---

## 17. Billing Assessment

RoundFlow has **two entirely separate payment flows**, both verified live and working in the preceding session:

1. **Platform subscription** — businesses pay **Heimdell** a recurring fee (currently £19.99/month, live-verified) to use RoundFlow itself, via Stripe Checkout (`lib/platform-billing.ts`, `app/billing/subscribe`).
2. **Per-organisation customer payments** — each business's *own* end-customers pay *that business* (not Heimdell) for real-world window-cleaning/gardening services, through that organisation's own connected Stripe/GoCardless account (`lib/payments.ts`).

### Play Billing implications

- **Flow 2 is exempt.** Google Play policy explicitly exempts payment for physical, real-world services from the Play Billing requirement. A customer paying for a window clean is not a digital-goods transaction.
- **Flow 1 is the one requiring care.** Play generally requires its own billing system for digital content/features consumed inside the app. However, established precedent exists for B2B "run your business" software (scheduling tools, accounting software, POS systems) to be treated as productivity tools rather than consumer digital content — commonly by keeping the actual *purchase* flow off the Android app entirely.
- **Recommended launch model (minimises policy risk, stays commercially sensible):** Ship the Android app as **login-only for already-subscribed businesses**. Do not surface `/register` or `/billing/subscribe` inside the Android app's navigable UI — new businesses sign up and start their trial on the website, exactly as they do today, and the Android app is where an *already-subscribed* business's staff do their day-to-day scheduling/job work. The existing "Manage billing" Stripe Billing Portal link can reasonably stay in-app for managing an *already-established* subscription (view invoices, update card, cancel) — that reads as account management rather than a new purchase, though this specific point **requires legal/manual confirmation** against Play's current exact policy wording before relying on it at submission time.
- If self-signup *inside* the Android app is wanted later, that would require replacing the Stripe Checkout step with Google Play Billing for the subscription — a real, nontrivial future change, out of scope for this audit.

---

## 18. Security Assessment

| Area | Finding |
|---|---|
| Exposed secrets in the repo | **None found.** All sensitive keys live in Netlify environment variables; per-organisation payment credentials are entered via masked (`type="password"`) form fields and never echoed back in full |
| Client-side secret keys | None found — the only `process.env` usage inside `"use client"` components (`components/admin/push-subscribe-button.tsx`, `components/layout/update-available-banner.tsx`) reference `NEXT_PUBLIC_`-prefixed values only, which are intentionally public |
| Debug/temporary routes in production | **None** — this session created and fully removed several temporary diagnostic routes during unrelated work; a fresh search this audit confirms none remain |
| Admin routes exposed to normal tenant users | **No** — extensively rebuilt and live-tested this session specifically to prevent this; `/admin` runs on a fully separate, non-NextAuth session system |
| Tenant isolation | Sampled action files (`app/actions/jobs.ts` and others touched throughout the preceding session) consistently scope queries by `organizationId: session.user.organizationId` before acting. The one deliberate, clearly-commented exception is `app/actions/super-admin.ts` (by design, gated by `requireSuperAdmin()`). **Not exhaustively reviewed line-by-line for every action file** — a fuller pass is recommended before scaling to many tenants |
| SQL injection | Prisma ORM used throughout with no raw string-concatenated queries in application code (the raw SQL written this session lives only in versioned migration files, not user-input-driven runtime code) |
| XSS | React's default JSX escaping applies throughout; no `dangerouslySetInnerHTML` usage found anywhere in the codebase |
| CSRF | NextAuth provides built-in CSRF protection for its own endpoints (its `/api/auth/csrf` token flow); Next.js Server Actions carry their own origin-check protection by default |
| Session cookie config | The custom admin session cookie is explicitly configured `httpOnly`, `secure`, `sameSite: lax` — correct. NextAuth's own session cookie flags rely on the library's defaults; not overridden anywhere found — **REQUIRES MANUAL CONFIRMATION** of the exact flags this specific NextAuth v5 beta version applies |
| Public file access / exposed buckets | Not applicable — there is no separate file storage; uploaded photos are embedded directly in database rows, not served from a public bucket |
| Sensitive error messages | Not exhaustively audited this pass — **REQUIRES MANUAL CONFIRMATION** whether any server action leaks internal error detail (e.g. raw Postgres error text) to the client in a production build |
| Excessive logging of personal data | Not found in the code paths reviewed — `console.error` calls sampled during this session logged technical failure context, not PII payloads |
| Vulnerable/obsolete dependencies | `npm audit --omit=dev` reports **3 high-severity** findings, all transitive (`postcss`, `sharp`, via `next`), fixable only via a breaking Next.js 16.x upgrade — not currently exploitable through this app's own usage pattern, but worth tracking |
| Per-org payment credentials at rest | Stored as plain-text DB columns, no application-layer encryption (§6.4) |

---

## 19. Testing Results

All commands below were actually run during this audit, on this machine, against the current repository state — nothing in this section is inferred.

| Check | Result |
|---|---|
| `npm run lint` (ESLint) | ✅ **Pass** — no errors or warnings |
| `npx tsc --noEmit` (TypeScript) | ✅ **Pass** — no type errors |
| `npx next build` | ✅ **Pass** — clean production build, all 25 routes compiled successfully |
| `npm test` | ❌ **No test script exists** (`npm error Missing script: "test"`) |
| Unit/integration test files | **None found** anywhere in the repository (`*.test.ts`, `*.test.tsx`, `*.spec.ts` — zero matches) |
| `npm audit --omit=dev` | 3 high-severity transitive vulnerabilities (§18) |

### Untested/unverified critical workflows (this audit did not, and could not, exercise these live)
- **Mobile device testing** — no real or emulated Android device was used; all mobile-experience findings in §7 are static-code-based, not observed
- **Authentication edge cases** — password reset (doesn't exist), invite flow (confirmed broken by code inspection, not by attempting an actual invite), rate limiting behaviour under load
- **Tenant-isolation testing** — no automated test suite exists to regression-guard the `organizationId` scoping pattern found by sampling; this is enforced by convention/code review, not by tests
- **Account-deletion testing** — not applicable, the feature does not exist
- **Payment testing** — the per-org Stripe payment flow (checkout link generation → payment → webhook → transaction recorded) was live-tested end-to-end in the immediately preceding work session, with real test-mode Stripe transactions confirmed to record correctly in Financials. That verification is real and current, but is not re-run as part of *this* audit
- **Notification testing** — the admin push-notification "sign-up alert" feature was built and code-reviewed but never confirmed with an actual push notification arriving on a device (noted as an open item in the preceding session)
- **Offline testing** — the service worker's static-asset caching behaviour was not exercised in airplane mode/offline during this audit

---

## 20. Exact Implementation Plan, Divided into Phases

This audit does not implement any of the following — it is a plan for future work.

**Phase 1 — Compliance blockers (must complete before submission)**
1. Build an in-app "Delete my account / organisation" flow (Settings, org-admin-gated).
2. Build a public, unauthenticated web deletion-request page, linked from the legal pages and the eventual Play listing.
3. Decide and implement a retention policy for invoice/tax records at deletion time (immediate erase vs. anonymized retention window) — depends on Andy's answer in §10.
4. Set up the dedicated reviewer account per §16 (register → manually flip `subscriptionStatus` to `active` via `/admin`).

**Phase 2 — High-priority fixes**
5. Fix the team-invite flow (§6.1) — generate a temp password or build a proper invite-token flow.
6. Add self-service password reset.
7. Add `app/error.tsx` and `app/global-error.tsx`.
8. Resolve the plain-text credential storage question (§6.4) — confirm Neon's at-rest encryption, and/or add application-layer encryption for `stripeSecretKey`/`gocardlessAccessToken`/webhook secrets.

**Phase 3 — Legal/store content**
9. Update the Privacy Policy to cover mobile app use, camera permission, and push-notification token collection.
10. Write the account-deletion section of the Privacy Policy once Phase 1 ships.
11. Write store listing copy (title, short/full description), capture phone/tablet screenshots, produce a feature graphic.
12. Complete the Play Console Data Safety form using §13 of this report as the source data.

**Phase 4 — Android packaging (TWA)**
13. Choose and register the package name (§12).
14. Generate the upload keystore, enrol in Play App Signing.
15. Run Bubblewrap against the production manifest to generate the Android project.
16. Host `/.well-known/assetlinks.json` on the production domain with the signing key's SHA-256 fingerprint.
17. Set `targetSdkVersion`/`compileSdkVersion` to API 36 (Android 16) per the >31 Aug 2026 requirement; set an appropriate `minSdkVersion`.
18. Build and sign the AAB.

**Phase 5 — Testing and release**
19. Real-device testing pass covering §7's mobile-UX findings (back-button behaviour, bottom-nav tap targets, loading states) and §19's untested workflows.
20. Internal testing track in Play Console with the reviewer/demo account.
21. Closed testing track with a small group of real users (e.g. GreenFix staff).
22. Production release.

---

## 21. Final Pre-Submission Checklist

- [ ] In-app account/organisation deletion implemented
- [ ] Public web account-deletion page implemented and linked from the Play listing
- [ ] Reviewer account created and `subscriptionStatus` manually set to `active`
- [ ] Reviewer account populated with fictional demo data, verified isolated from GreenFix's real data
- [ ] Team-invite bug fixed (or feature hidden until fixed)
- [ ] Self-service password reset implemented
- [ ] `error.tsx`/`global-error.tsx` added
- [ ] Privacy Policy updated for mobile app / camera / push-notification / deletion coverage
- [ ] Package name chosen and confirmed with Andy
- [ ] Digital Asset Links (`assetlinks.json`) hosted and verified
- [ ] Upload keystore generated, Play App Signing enrolled
- [ ] `targetSdkVersion` set to API 36 (Android 16)
- [ ] Store listing assets produced (icon, feature graphic, phone/tablet screenshots, descriptions)
- [ ] Data Safety form completed using §13
- [ ] Content rating questionnaire completed
- [ ] App Access instructions submitted (§16)
- [ ] Ads declaration submitted (**none needed** — no ad SDKs found anywhere)
- [ ] Real-device testing pass completed for §7 findings
- [ ] Internal testing track run before closed/production release

---

## Terminal Summary

```
ROUNDFLOW — GOOGLE PLAY READINESS AUDIT
========================================
Overall readiness score:        42 / 100
Release recommendation:         NOT READY
Critical blockers:              2
  1. No account-deletion route (in-app or web) — named Play policy requirement
  2. New signups hit a real Stripe paywall before any functionality is visible

Recommended packaging method:   Trusted Web Activity (TWA) via Bubblewrap
Account deletion compliant?     NO
Privacy documentation compliant? PARTIAL (solid content, missing app/camera/
                                  push/deletion-specific sections)
Reviewer access possible?       YES — via existing admin subscription-status
                                  override, no code change needed (see §16)
Billing creates Play risk?      YES, if the in-app subscribe/register flow is
                                  exposed to Android users — mitigated by
                                  shipping login-only for existing subscribers

First five actions required:
  1. Build in-app + public web account-deletion routes (§5.1)
  2. Register the reviewer account and grant it `active` status via /admin (§16)
  3. Fix the team-invite flow that currently creates unusable locked-out users (§6.1)
  4. Add app/error.tsx and app/global-error.tsx (§6.3)
  5. Decide the Android launch model (login-only vs. in-app signup) with Andy (§17)
```
