# RoundFlow account deletion — Phase 1 implementation report

Status: **implemented locally, not deployed.** Nothing in this phase was pushed to GitHub, deployed to Netlify, or run against a production database. All schema and code changes are staged in the working tree only.

**Phase 1.1 addendum (same date):** abuse protection (rate limiting) for the public deletion-request form — see [§16](#16-phase-11-abuse-protection-for-the-public-deletion-request-form) at the end of this document. Also implemented locally only, not deployed.

---

## 1. Files changed

**New (Phase 1):**
- `prisma/migrations/20260805110000_account_deletion_requests/migration.sql`
- `lib/account-deletion.ts` — tokens, retention math, anonymisation, org-deletion processing
- `app/actions/account-deletion.ts` — in-app individual + organisation deletion actions
- `app/actions/public-deletion.ts` — public unauthenticated request + email verification actions
- `app/actions/admin-deletion-queue.ts` — platform-admin processing actions
- `app/legal/delete-account/page.tsx` — public deletion-resource page
- `app/legal/delete-account/verify/page.tsx` — email verification landing page
- `app/admin/deletion-requests/page.tsx` — platform-admin queue page
- `components/settings/delete-account-button.tsx`
- `components/settings/delete-organization-section.tsx`
- `components/settings/transfer-admin-button.tsx`
- `components/legal/delete-account-form.tsx`
- `components/admin/deletion-request-row.tsx`
- `vitest.config.ts`
- `tests/account-deletion-core.test.ts`
- `tests/account-deletion-actions.test.ts`
- `tests/public-deletion-actions.test.ts`
- `tests/admin-deletion-queue-actions.test.ts`

**New (Phase 1.1 — abuse protection, see §16):**
- `prisma/migrations/20260805150000_rate_limit_buckets/migration.sql`
- `lib/rate-limit.ts` — HMAC key hashing, trusted-IP resolution, fixed-window counters, failure lockout
- `tests/rate-limit.test.ts`

**Modified (Phase 1):**
- `prisma/schema.prisma` — 3 new enums, `AccountDeletionRequest`, `PlatformBillingRecord`, back-relations on `Organization`/`User`
- `app/(dashboard)/settings/page.tsx` — "Your account" + admin-only "Danger zone" cards, transfer-admin control
- `app/admin/layout.tsx` — "Deletion requests" nav link
- `app/legal/privacy/page.tsx` — new §6 "Account deletion", expanded retention section
- `app/legal/terms/page.tsx` — cross-reference to `/legal/delete-account`
- `components/layout/legal-footer.tsx` — "Delete My Account" link
- `package.json` — `test` script, `vitest` devDependency

**Modified (Phase 1.1):**
- `prisma/schema.prisma` — added `RateLimitBucket` model
- `app/actions/public-deletion.ts` — wired in IP/email submission limits and verification-attempt lockout
- `app/legal/privacy/page.tsx` — new §6.4 disclosing the rate-limiting metadata (hashed IPs/emails)
- `tests/account-deletion-actions.test.ts` — added a test confirming the authenticated in-app flow is unaffected by the new limiter

## 2. Database changes

Three enums (`DeletionRequestType`, `DeletionRequestSource`, `DeletionRequestStatus`) and three new tables:

- **`AccountDeletionRequest`** — the audit trail. `organizationId`/`userId` are nullable FKs with `onDelete: SetNull`, paired with plain-string snapshots (`organizationNameSnapshot`, `userEmailSnapshot`, `requesterEmail`) so the record stays meaningful after the referenced row is gone or anonymised. Verification tokens are stored only as a SHA-256 hash (`verificationTokenHash`), never in plain text. Indexed on `organizationId`, `userId`, `status`.
- **`PlatformBillingRecord`** — Heimdell's own retained accounting record. Deliberately has **zero foreign keys** (not even nullable ones), so no future cascade can ever touch it. Holds only organisation name/slug and Stripe reference IDs — no tenant customer data of any kind.
- **`RateLimitBucket`** (Phase 1.1) — abuse-protection counters for the public deletion-request form only. No foreign keys, deliberately, so it can never interfere with account/organisation deletion in either direction. See §16 for full detail.

Migration SQL was hand-written for both migrations (`prisma/migrations/20260805110000_account_deletion_requests/migration.sql`, `prisma/migrations/20260805150000_rate_limit_buckets/migration.sql`) and validated with `npx prisma validate` / `npx prisma format` / `npx prisma generate`. **Neither has been run against any database** — no local or remote Postgres was available in this environment (`docker` is not installed here), so `prisma migrate deploy` has not been exercised. This is the top item in the manual-testing list (§12, §16).

## 3. User (individual) deletion behaviour

- Entry point: Settings → "Your account" → "Delete my account" (`components/settings/delete-account-button.tsx`).
- Requires re-entering the current password server-side (`app/actions/account-deletion.ts`, bcrypt comparison against the stored hash — never trusts a client-supplied "I confirmed" flag).
- If the requester is the organisation's only active `ADMIN`, deletion is refused with an explanatory message and no data is touched; the UI instead offers a "Make admin" action next to another active teammate (`transfer-admin-button.tsx` → `transferAdminRoleAction`) so there's a real way out short of deleting the whole organisation.
- Otherwise the user row is **anonymised in place**, not row-deleted: `name` → `"Former user"`, `email` → a non-reversible `deleted-<id>@deleted.roundflow.invalid` placeholder, `phone`/`image`/`passwordHash` cleared, `isActive: false`. All `Session` and `Account` (OAuth) rows for that user are deleted in the same transaction.
- Effect: `authorize()` in `lib/auth.ts` already independently rejects sign-in on both `!passwordHash` and `!isActive`, so future sign-in is blocked with no new code needed there. Existing `Job.assignedWorker`/`completedByWorker` UI already renders `.name`, so historical job records show "Former user" automatically.
- A `COMPLETED` `AccountDeletionRequest` audit row is written immediately (source `IN_APP`), with `userId: null` (deliberately unlinked, since the row itself still exists anonymised) and a `retentionSummary` describing what happened.
- This flow is processed synchronously, not queued — anonymising one user is far less destructive than an organisation-wide cascade, and the requester has already proven their identity via password re-entry.

## 4. Organisation deletion behaviour

- Entry point: Settings → "Danger zone" (admin-only), `components/settings/delete-organization-section.tsx`.
- Requires: caller re-verified as `ADMIN` **fresh from the database** (`requireFreshAdmin()`, not the JWT session claim), current password, and the organisation's exact name typed into a confirmation field.
- Shows the full list of affected data categories before submission, and a warning to export any legally-required customer/invoice records first.
- Submitting **does not run the destructive cascade**. It creates a `VERIFIED` `AccountDeletionRequest` (source `IN_APP` — already authenticated + password-confirmed, so no separate email loop is needed) and immediately calls `cancelFutureBillingForOrganization()`, which cancels the Heimdell Stripe subscription right away so nothing more is charged while the request sits in the admin queue.
- A duplicate active request (`PENDING_VERIFICATION`/`VERIFIED`/`IN_PROGRESS`) for the same organisation is rejected before a new one is created.
- While pending, Settings shows a notice with the expected processing deadline and a "Cancel deletion request" button (`cancelOrganizationDeletionRequestAction`), which only works while the request is still `PENDING_VERIFICATION` or `VERIFIED` and re-checks it belongs to the caller's own organisation.
- The actual cascade only runs when a platform admin processes the request from `/admin/deletion-requests` (§9).

## 5. Data deleted

**On individual deletion:** name, email, phone, avatar image, password hash, all sessions, all linked OAuth accounts.

**On organisation deletion (processed):** the `Organization` row is deleted, which cascades at the database level (existing schema relations, unchanged by this phase) to every `User`, `Customer`, `Property`, `Round`, `Job`, `Service`, `Transaction`, `Notification`, push subscription, and connected Stripe/GoCardless credential belonging to that organisation. Nothing tenant-specific survives.

## 6. Data retained, and why

Two retained records, both deliberately minimal:

1. **`AccountDeletionRequest` audit row** — proves a request was made and processed, and when. Contains only: request type/source/status, timestamps, the requester's email at time of request, an organisation-name snapshot, and free-text processing notes. No customer data, no passwords, no tokens (blanked on use).
2. **`PlatformBillingRecord`** — Heimdell's own subscription-billing accounting record (organisation name/slug, Stripe customer/subscription reference IDs, subscription start/end, last status, retention date). **Contains no tenant customer personal data** — no customer names, emails, phones, addresses, job data, or photos. This is Heimdell's own commercial record of "who paid us, when," not the tenant's business records.

Per the explicit instruction not to retain tenant customer data under Heimdell's own accounting justification, **no customer invoices, transactions, or operational records are copied out before the cascade** — they are deleted along with the organisation. The in-app UI warns admins to export anything they are legally required to keep before requesting deletion.

## 7. Why the retained data is lawful and necessary

- The `AccountDeletionRequest` row is the accountability record required to demonstrate compliance with the deletion request itself — retaining proof that a deletion occurred is compatible with (indeed required by) data-protection obligations, and it is minimised to non-sensitive metadata.
- The `PlatformBillingRecord` is retained under Heimdell Tech Ai Ltd's own UK accounting/tax record-keeping obligation (Companies Act 2006 s.388 / HMRC guidance), which applies to Heimdell as a business, not to the tenant's data. It holds Stripe reference IDs, not financial detail — the underlying transaction/invoice detail remains Stripe's own responsibility as an independent data controller for payment processing.

## 8. Retention expiry calculation

- **Processing deadline** (`calculateProcessingDeadline`): one calendar month from verification (`date-fns` `addMonths`), matching GDPR/Play's "without undue delay, within one month" requirement.
- **Billing record retention** (`calculateBillingRetentionDate`, updated in Phase 1.4 — see §19): **Heimdell Tech Ai Ltd's financial year end is confirmed as 31 May.** Retention is now six years after the end of the Heimdell financial year in which the underlying billing transaction date falls — the standard UK Companies Act 2006 / HMRC record-keeping formulation. This replaced the earlier flat "6 years from the raw transaction date" calculation, which was flagged in this document as a placeholder pending exactly this confirmation. §19 has the full method, worked examples, and real-database test results.

## 9. Third-party deletion handling

- **Stripe (platform billing):** the organisation's Heimdell subscription is cancelled via the Stripe API — once immediately when a deletion request is made (`cancelFutureBillingForOrganization`), and again defensively (idempotently) during actual processing (`processOrganizationDeletion`) in case it wasn't already cancelled. Both paths only run if `PLATFORM_STRIPE_SECRET_KEY` is configured, and both swallow/log Stripe errors rather than blocking the deletion on a billing API failure.
- **Stripe/GoCardless (tenant's own connected accounts):** the organisation's own `stripeSecretKey`, `stripeWebhookSecret`, and `gocardlessAccessToken`/`gocardlessWebhookSecret` are stored on the `Organization` row and are deleted with it in the cascade — no separate revocation call is made to Stripe/GoCardless to invalidate those specific credentials before deletion. **This is a gap, not a false claim of completeness** — see §12.
- **Resend (email):** no separate action needed; Resend is used to send the verification email itself, and holds no ongoing subscriber-list state to purge.
- **Web push:** push subscriptions are tenant-owned rows and are removed via the same organisation cascade.

## 10. Security controls implemented

- All in-app actions require an authenticated session (`requireSession()`), and organisation-level actions additionally re-check `ADMIN` role **and** organisation membership fresh from the database (`requireFreshAdmin()`) rather than trusting the JWT session claim — verified in tests (§11) by simulating a session that *claims* `ADMIN` while the DB says otherwise.
- Individual and organisation deletion both require re-entering the current password server-side; organisation deletion additionally requires typing the exact organisation name.
- Public verification tokens: 32 random bytes (`crypto.randomBytes`), only the SHA-256 hash is ever persisted, compared with `crypto.timingSafeEqual` (not `===`), single-use (blanked on verification), and time-limited (48 hours).
- The public request form never asks for a password, and its response message is byte-for-byte identical whether or not the submitted email matches a real account, whether a request already exists, or whether an internal error occurred — verified in tests.
- All platform-admin processing actions are gated by `requireSuperAdmin()`, which is backed entirely by the separate, hand-rolled HMAC-signed-cookie `PlatformAdmin` session (`lib/admin-auth.ts`) — never the tenant NextAuth session. The admin queue page and every action in `app/actions/admin-deletion-queue.ts` are unreachable by a tenant user regardless of role.
- Processing of both user and organisation deletion requests is idempotent: both actions short-circuit to `{ ok: true }` if the request is already `COMPLETED`, and `processOrganizationDeletion()` itself returns `{ alreadyDeleted: true }` if the organisation row is already gone — a repeated click can never double-cancel a subscription or create a duplicate billing record.
- No passwords, tokens, or secrets are logged anywhere in the new code; error logging (`console.error`) is limited to non-sensitive operational failures (e.g. a failed Stripe cancellation).

**Resolved in Phase 1.1:** IP- and email-based rate limiting on the public request-form endpoint, plus verification-attempt lockout, are now implemented — see §16. The gap noted below has been superseded; kept here for the historical record of Phase 1 as originally shipped.

~~**Known gap:** there is no IP-based rate limiting on the public request-form endpoint — only a same-email duplicate-active-request check. No rate-limiting infrastructure (e.g. Redis/Upstash) exists elsewhere in this project to build on. This should be treated as a pre-launch blocker or mitigated at the edge (e.g. Netlify/Cloudflare rate limiting) rather than in-app.~~

## 11. Test results

**63 of 63 tests passing, plus 1 documented `it.todo`** (`npm test`, Vitest, run locally against a **mocked** Prisma client — see §12 for what this does and doesn't prove).

- `tests/account-deletion-core.test.ts` (11 tests) — token generation/hashing/timing-safe comparison, processing-deadline math, billing-retention-date math.
- `tests/account-deletion-actions.test.ts` (13 tests) — normal user deletion; sole-admin blocked (and unblocked once a second admin exists); wrong password rejected; non-admin blocked from organisation deletion including when the session claims `ADMIN` but the DB doesn't; exact-name-match enforcement; duplicate active request prevention; cross-tenant cancellation blocked; completed requests immutable to cancellation; **(Phase 1.1)** authenticated in-app deletion requests are unaffected by the public rate limiter.
- `tests/public-deletion-actions.test.ts` (19 tests + 1 todo) — identical response for matching vs non-matching email (anti-enumeration); identical response on internal error; duplicate-request no-op; missing-confirmation rejection; valid token verification; invalid/expired token rejection; malformed token short-circuits before any DB query; token cannot be replayed after first use; **(Phase 1.1)** requests below threshold succeed, 6th submission from one IP in an hour is blocked, case-variation email bypass is blocked, whitespace-padded email is rejected at input validation before reaching the limiter, the same-email limit holds across different IPs, expired rate-limit windows stop blocking, raw IP is never persisted, two organisations' requests stay isolated, 10 failed verification attempts lock out an IP, a successful verification is never penalised; `it.todo` documents that verification-email resend limiting isn't applicable (no resend feature exists yet).
- `tests/admin-deletion-queue-actions.test.ts` (8 tests) — non-super-admin caller rejected; user-deletion processing and its idempotency; organisation-deletion processing (asserts the retained billing record's keys are exactly the allowed set and contain no customer-data fields), its idempotency, and idempotency when the organisation row is already gone; closed requests immune to reject/cancel.
- `tests/rate-limit.test.ts` (12 tests, Phase 1.1) — unit-level coverage of `lib/rate-limit.ts` in isolation: below-threshold requests allowed, threshold-exceeding request blocked with a retry-after, window expiry resets the count, the raw key is never persisted (only its HMAC hash, format-checked), different keys within a scope are isolated, failure-lockout does/doesn't trip correctly, checking lockout status alone is never itself counted, `x-nf-client-connection-ip` is trusted, a spoofed `x-forwarded-for` alone is not, and `normalizeEmail` trims/lowercases.

Also passing as part of the same validation pass: `npm run lint` (ESLint, zero errors), `npx tsc --noEmit` (zero errors), `npx prisma validate` (schema valid), `npx next build` (production build succeeds, including the new `/legal/delete-account` and `/admin/deletion-requests` routes).

## 12. Manual/integration tests still required before deployment

These were **not** exercisable in this environment (no Docker, no live database) and must be run against a real Postgres instance before shipping:

1. Run the actual migration (`prisma migrate deploy`) against a real (ideally staging, not production) database and confirm it applies cleanly.
2. End-to-end individual deletion through the real UI: confirm sign-out, confirm login is actually blocked afterward, confirm a historical job's assigned-worker display shows "Former user".
3. End-to-end organisation deletion request → admin queue → processing, against a real database, confirming the cascade actually removes every expected row (customers, properties, jobs, transactions, notifications, push subscriptions) and that no orphaned rows are left behind.
4. Real Stripe test-mode verification that subscription cancellation actually succeeds via the live Stripe API (only mocked/skipped here, since `PLATFORM_STRIPE_SECRET_KEY` is unset in this environment).
5. Real email delivery test of the verification email via Resend (only the "Resend not configured" fallback path was exercised here).
6. Load/abuse-test the public request form's now-implemented rate limiter (§16) under real concurrent traffic against a real database — confirm the accepted small race-condition tolerance (§16) doesn't let more than a handful of extra requests through under a genuine burst, and that the migration's unique constraint holds up under concurrent upserts.
7. Confirm connected Stripe/GoCardless *tenant* credentials are also revoked with the provider (not just deleted from the database) — currently the org's stored keys are deleted, but no explicit revocation API call is made before that happens.
8. Accessibility/manual UX pass on the new Settings cards, public page, and admin queue UI.

## 13. Migration and deployment steps (for review — not yet executed)

1. Review this report and the diff with Andy.
2. Confirm the six-year billing-retention assumption (§8, §15) with Heimdell's accountant, and adjust `calculateBillingRetentionDate` if needed.
3. Decide on the rate-limiting gap (§10/§12).
4. Run `npx prisma migrate deploy` against staging (applies both the Phase 1 and Phase 1.1 migrations), then verify with the manual tests in §12.
5. Set `PLATFORM_STRIPE_SECRET_KEY` and confirm test-mode Stripe cancellation works end-to-end.
6. No new environment variable is required for rate limiting — it reuses the already-required `AUTH_SECRET` (§16). Confirm `AUTH_SECRET` is set in the Netlify environment (it already must be, for NextAuth/admin sessions).
7. Deploy to staging (Netlify), smoke-test both deletion flows, the public page, and the rate limiter (§16) end-to-end.
8. Only then deploy to production. **No deployment has been performed as part of this phase.**

## 14. Rollback plan

- Nothing has been deployed, so there is nothing to roll back in production.
- If issues are found after a future deployment: `prisma/migrations/20260805110000_account_deletion_requests/migration.sql` only *adds* two new tables, three new enum types, and two new nullable columns — it drops nothing and modifies no existing table's existing columns. Likewise `prisma/migrations/20260805150000_rate_limit_buckets/migration.sql` only *adds* one new table. A rollback migration would only need to `DROP TABLE account_deletion_requests, platform_billing_records, rate_limit_buckets` and drop the three enum types; no existing data is at risk from either migration.
- The new UI surfaces (Settings cards, public page, admin queue page) are additive routes/components — disabling them (e.g. via a feature flag, or reverting the relevant files) would not affect any other part of the app, since no existing code path was changed to call into `lib/account-deletion.ts`.
- If the rate limiter itself needed to be disabled in an emergency (e.g. a bug is blocking legitimate users) without a redeploy: there is no feature flag for this in Phase 1.1 — the fastest safe rollback is reverting `app/actions/public-deletion.ts` to its pre-Phase-1.1 version and redeploying, since the limiter is entirely additive to that one file (plus the new, harmless-if-unused `rate_limit_buckets` table).

## 15. Legal/accounting assumptions requiring confirmation

1. ~~**Billing retention period basis** (§8): six years from subscription end date, not from the end of Heimdell's financial year.~~ **Resolved in Phase 1.4** — Heimdell's financial year end (31 May) has been confirmed and the calculation updated accordingly. See §19.
2. **Ambiguous organisation names on the public form**: `Organization.name` is not unique in the schema, so the public form's `findFirst` lookup by name could match the wrong organisation if two tenants share a name. This is treated as a rare edge case a platform admin can reconcile manually using the verified request's other details, but it's worth Andy's awareness.
3. ~~**Rate limiting** (§10/§12): the public deletion-request endpoint has no IP-based rate limiting.~~ **Resolved in Phase 1.1** — see §16.
4. **Tenant-side Stripe/GoCardless key revocation** (§9/§12): connected payment credentials are deleted from the database but not explicitly revoked with the provider before deletion. Confirm whether this is acceptable or whether an explicit revocation call should be added.
5. **"Per request" verification lockout, reinterpreted as "per guessing IP"** (§16): the original spec described a lockout of "10 failed verification attempts per request." Because a blind token guess can't be attributed to a specific `AccountDeletionRequest` unless and until it actually matches one, this was implemented as 10 failed attempts per guessing IP instead — functionally equivalent protection against brute-forcing, scoped to what's actually knowable at guess time. Flagging for Andy's awareness in case a different interpretation was intended.

---

## 16. Phase 1.1: abuse protection for the public deletion-request form

Scope of this addendum: the unauthenticated public endpoints only (`submitPublicDeletionRequestAction`, `verifyPublicDeletionRequestAction` in `app/actions/public-deletion.ts`). No other functionality was touched — the authenticated in-app flows (`app/actions/account-deletion.ts`) and the platform-admin queue (`app/actions/admin-deletion-queue.ts`) are unaffected, verified explicitly by a dedicated test (§11).

### 16.1 Rate-limiting architecture

- **Storage:** a new Postgres table, `RateLimitBucket` (`prisma/schema.prisma`), not an in-memory `Map` or process-local counter — Netlify runs this app as distributed/serverless functions with no shared, persistent memory between invocations or instances, so an in-memory counter would silently fail to limit anything (each cold start / concurrent instance would see its own counter reset to zero). The database is already provisioned (Neon Postgres) and already the source of truth for the rest of the deletion system, so this reuses existing infrastructure rather than adding a new dependency (no Redis/Upstash — requirement 5, "do not introduce a paid external dependency unless strictly necessary," is satisfied by not needing one at all).
- **Algorithm:** a fixed-window counter per `(scope, key)` pair. `scope` identifies which limit is being checked (e.g. `public_deletion_submit_ip`); `key` is a keyed-HMAC hash of the real value (IP address or normalised email — never stored raw). Each check is a single atomic `INSERT ... ON CONFLICT ("scope", "key") DO UPDATE` statement (via `prisma.$queryRaw`) — **not** a separate read followed by a write.
  **Historical note:** an earlier version of this function did use a separate read (`findUnique`) then write (`upsert`/`update`), with a documented "known tradeoff" accepting a possible small race under concurrent bursts. That race was later measured directly against real Postgres (3 of 8 concurrent requests overran a limit of 5) and fixed by replacing it with the atomic statement described above — see §18 for the root cause, the fix, and 20 repeated real-database trials confirming zero overruns. The tradeoff described in earlier drafts of this document no longer applies.
- **Two limiter shapes**, both built on the same table:
  1. **Volume limiter** (`checkAndRecordRateLimit`) — every call counts, success or failure alike. Used for submission volume (by IP and by email), so the limiter's own behaviour is never a side channel for account enumeration: it behaves identically whether or not the submitted email matches a real account.
  2. **Failure-lockout limiter** (`isLockedOut` / `recordFailedAttempt`) — checked before an attempt, incremented only on failure. Used for verification-token guessing, so a caller who gets it right first time is never penalised.

### 16.2 Limits selected (and one deviation, explained)

| Limit | Value | Matches spec? |
|---|---|---|
| Deletion-request submissions per IP | 5 / hour | Yes |
| Deletion-request submissions per normalised email | 3 / 24 hours | Yes |
| Verification-email resends per request | — | **Not implemented** — no resend feature exists anywhere in this codebase yet (confirmed by searching the repo before starting this work). Building a resend feature was out of scope ("abuse protection... only," "do not change unrelated functionality"). `isLockedOut`/`recordFailedAttempt` are written generically so a future resend action can reuse them directly without any changes to `lib/rate-limit.ts`. Documented as an `it.todo` in the test suite rather than silently skipped. |
| Failed verification attempts before lockout | 10, scoped **per guessing IP** rather than "per request" | **Adjusted, explained**: a blind token guess can't be attributed to a specific `AccountDeletionRequest` unless it actually matches one (that's the point of a 256-bit token) — there is no partial-credit "which request was this guess for" signal to key a per-request counter on. Locking the *guessing IP* after 10 failures within an hour provides the same practical brute-force protection the spec was asking for, applied to the entity that's actually identifiable at guess time. See §15.5. |

All four numeric limits are configurable constants at the top of `app/actions/public-deletion.ts` (`MAX_SUBMISSIONS_PER_IP_PER_HOUR`, `MAX_SUBMISSIONS_PER_EMAIL_PER_DAY`, `MAX_FAILED_VERIFICATIONS_PER_IP`, `VERIFY_LOCKOUT_WINDOW_MS`) — easy to retune without touching `lib/rate-limit.ts`.

### 16.3 Data stored

Each `RateLimitBucket` row: `scope` (a fixed string identifying which limit, not personal data), `key` (a keyed-HMAC hash — see §16.4), `count` (integer), `expiresAt`, `createdAt`, `updatedAt`. Nothing else. No IP address, no email address, no request ID, no free text, and **no relation to any other table** — it cannot be joined back to a user, organisation, or deletion request, and deliberately cannot interfere with (or be affected by) account/organisation deletion in either direction.

### 16.4 Hashing method

Keyed HMAC-SHA256 (`crypto.createHmac("sha256", secret)`), not a plain or unsalted hash — satisfies the explicit requirement to make the stored value non-reversible even if the table were ever exposed. The HMAC input is `${scope}:${rawValue}` (domain-separated by scope, so the same IP hashes to a different value for the submit-IP limiter vs. the verify-IP limiter, preventing correlation between the two).

**Key used:** the existing `AUTH_SECRET` environment variable (already required for NextAuth session signing and the platform-admin cookie session — see `lib/admin-auth.ts`), not a new dedicated secret. This was a deliberate choice over introducing a second required secret: `AUTH_SECRET` is already guaranteed to be present in every environment this app runs in, so reusing it adds zero new deployment risk (a forgotten new env var would otherwise make the public form 500 in production). The scope-prefixed HMAC input provides domain separation, so this reuse can't be confused with, or weaken, `AUTH_SECRET`'s other uses.

### 16.5 Retention period

- IP-based buckets (`public_deletion_submit_ip`, `public_deletion_verify_ip`): expire after **1 hour**.
- Email-based buckets (`public_deletion_submit_email`): expire after **24 hours**.
- Expiry is enforced at the application layer (`expiresAt` checked on every read) and rows are opportunistically deleted (`lib/rate-limit.ts`'s `maybeCleanupExpired()`, a ~5%-of-calls probabilistic `deleteMany` sweep) — see §16.8 for why a probabilistic sweep rather than a scheduled job.
- **Purpose statement for the privacy policy** (added — `app/legal/privacy/page.tsx` §6.4, since this phase does store new security metadata): these counters exist solely to prevent abuse of the public, unauthenticated deletion-request form; they are not used for any other purpose, are not linked to any account, and are minimised to the smallest data needed for the purpose (a hash and a count).

### 16.6 Environment variable required

**None new.** Reuses `AUTH_SECRET`, which is already a required environment variable for this application (NextAuth + the platform-admin session). See §16.4 for the rationale.

### 16.7 Test results

12 new unit tests (`tests/rate-limit.test.ts`) plus 11 new integration-level tests and 1 `it.todo` added to `tests/public-deletion-actions.test.ts`, plus 1 new test in `tests/account-deletion-actions.test.ts` confirming the authenticated flow is unaffected. All passing — see §11 for the full breakdown and the project-wide total (63 passed, 1 todo). `npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, and `npx next build` all pass with these changes included (re-run and confirmed after this addendum, not just before it).

### 16.8 Deployment steps (not yet executed)

1. Run `npx prisma migrate deploy` against staging — applies `20260805150000_rate_limit_buckets` (additive only, see §14).
2. Confirm `AUTH_SECRET` is already set in the target environment (it must already be, for auth to work at all).
3. Deploy and manually verify: submit 6 requests from one IP within an hour and confirm the 6th is blocked; submit 4 requests for one email within a day and confirm the 4th is blocked; confirm normal, low-volume usage is never affected.
4. Load-test at a level representative of real abuse (see §12 item 6) to sanity-check the read-then-write race tolerance (§16.1) in practice, not just in the mocked test suite.

### 16.9 Cleanup strategy

No scheduled job or cron infrastructure exists in this project to hook a periodic sweep into (checked before implementing — no Netlify Scheduled Functions, no existing background-job runner). Given this table only ever holds one row per actively-rate-limited IP/email — a small, self-bounding number for a low-traffic public form — cleanup is handled opportunistically: roughly 1 in 20 rate-limit checks (`Math.random() >= 0.05` short-circuits the rest) also fires a fire-and-forget `deleteMany({ where: { expiresAt: { lt: now } } })`, which cannot fail the request it's piggybacking on (errors are swallowed). This keeps the table bounded without new infrastructure. If traffic volume ever makes this insufficient, the natural next step is a Netlify Scheduled Function running the same `deleteMany` query on a fixed cadence — noted here for future reference, not implemented, since no such infrastructure exists yet to extend.

### 16.10 Remaining manual checks

Carried into §12 (items 6) rather than duplicated here:
- Load/abuse-test the rate limiter against a real database under real concurrent traffic.
- Confirm the migration's unique constraint on `(scope, key)` behaves correctly under concurrent upserts in Postgres specifically (the mocked test suite cannot exercise real database-level concurrency behaviour).
- Manually confirm `x-nf-client-connection-ip` is actually present and correct on real Netlify-hosted requests (this environment could only be verified against Netlify's documented header contract, not a live deployment).

---

## 17. Phase 1.2: real-PostgreSQL staging validation

**Status: complete. 27/27 real-database validation phases passed against a genuinely isolated Neon project.** This section originally reported this work as blocked (no staging database existed at the time); Andy subsequently provisioned a dedicated Neon project and the full validation was run for real. What follows are the actual results.

### 17.1 Database environment used (no credentials)

- **Source variable:** `STAGING_DATABASE_URL`, read from a local `.env.staging.local` file (untracked — matches this repo's existing `.gitignore` pattern `.env*.local`, confirmed before use).
- **Provider:** Neon.
- **Project:** a dedicated Neon project (`roundflow-google-play-staging`, per Andy) — **a separate Neon project, not a branch within the `greenfixapp`/production project.** Its default branch happens to also be named `production` (Neon's own default branch-naming convention for a new project), which is why an earlier turn in this session flagged it for confirmation — project identity isn't visible from the connection string itself (Neon endpoint hostnames are opaque IDs), so this relied on Andy's explicit confirmation that it's a separate project, which is the correct authority for that fact.
- **Hostname:** `ep-soft-lab-ayekezyn.c-5.us-east-2.aws.neon.tech` (masked detail only — matches what the script itself prints, never the credential).
- **Database name:** `neondb`.
- **SSL enabled:** true.
- The connection string itself was never displayed, read back, or logged at any point — it was extracted from the `.env.staging.local` file via shell commands (`grep`/`cut`/`sed`) whose output was piped directly into environment variables, never into anything printed to this conversation.

### 17.2 Migration result

The project was entirely fresh (zero schema). `npx prisma migrate status` initially reported all 17 project migrations pending. `npx prisma migrate deploy` was run against it (with `DATABASE_URL`/`DATABASE_URL_UNPOOLED` both set to the staging connection string for that one command only) and applied all 17 migrations cleanly, ending with the two account-deletion/rate-limiting migrations from this feature. A follow-up `npx prisma migrate status` confirmed "Database schema is up to date!". No errors, no manual SQL intervention needed.

### 17.3 Tables and constraints verified

All confirmed against the real database via `information_schema`/`pg_constraint`/`pg_index` queries in `scripts/validate-account-deletion-staging.ts`:
- `account_deletion_requests`, `platform_billing_records`, `rate_limit_buckets` all exist.
- Both foreign keys on `account_deletion_requests` (`organizationId`, `userId`) are confirmed `ON DELETE SET NULL`, not `CASCADE`.
- `rate_limit_buckets` has a real unique index on `(scope, key)` and an index involving `expiresAt`.
  - **One test-script bug found and fixed here**: the first run queried `pg_constraint` for a `contype = 'u'` row, which found nothing — not because the constraint is missing, but because Prisma's `@@unique` compiles to a plain `CREATE UNIQUE INDEX`, which Postgres enforces identically to a named unique constraint but does **not** register in `pg_constraint`. Fixed by querying `pg_index.indisunique` instead, which is the correct way to detect either form. This was a flaw in the validation script's assertion, not in the actual schema/migration.
- Pre-existing tables (`organizations`, `users`, `customers`, `jobs`) retain their expected core columns — no unexpected destructive change.

### 17.4 Fixture structure

Exactly as designed and documented previously:
- **Organization A ("RoundFlow Deletion Test Ltd")**: 1 ADMIN + 1 OPERATIVE (with a real session + OAuth account attached to the operative), 2 fictional customers, 2 properties, 1 round, 2 services, 2 jobs (one completed, with before/after photo URL placeholders and worker notes), 1 transaction, 1 notification, fictional Stripe/GoCardless credential strings on the organisation.
- **Organization B ("RoundFlow Isolation Control Ltd")**: a separate, smaller fixture set used purely as the tenant-isolation control group.
- All emails used the `fixture.roundflow-staging.invalid` domain; all other fixture data was clearly fictional. No real GreenFix/RoundFlow data was created, read, or touched at any point.

### 17.5 Individual user deletion result

**Passed.** `anonymizeUser()` run for real against the fixture operative: `name` → `"Former user"`, email replaced with the `deleted-<id>@deleted.roundflow.invalid` placeholder, `passwordHash` cleared, `isActive` set to `false`, the real `Session` and `Account` rows were deleted. The historical completed job's `completedByWorker.name` correctly reads `"Former user"` via a live join. The organisation's admin user was completely unaffected. Sole-administrator protection (`isSoleActiveAdmin`) was also verified against real, live admin counts: blocks with 1 admin, unblocks the moment a 2nd admin exists, re-blocks after demoting back to 1 — computed from actual database state, not a stubbed value.

### 17.6 Organisation deletion result

**Passed.** `processOrganizationDeletion()` run for real against Organization A: the `Organization` row itself was confirmed gone (`findUnique` → `null`), and direct counts confirmed zero remaining `users`, `customers`, `jobs`, `rounds`, and matching zero for the fixture `transactions`/`notifications` by identifying key. Exactly one `PlatformBillingRecord` was created, referencing the deletion request.

### 17.7 Tenant-isolation result

**Passed.** Organization B's row and related counts (users, customers, jobs, transactions) plus its customers' emails were snapshotted before Organization A was touched, and compared byte-for-byte afterward — identical in every respect.

### 17.8 Idempotency result

**Passed.** `processOrganizationDeletion()` called a second time for the same, now-deleted organisation correctly returned `{ alreadyDeleted: true }`, and no second `PlatformBillingRecord` was created (confirmed by count, still exactly 1). The action-layer `status === "COMPLETED"` short-circuit guard was also confirmed against the real, now-completed request row.

### 17.9 Public verification result

**Passed.** A real token was generated, only its sha256 hash persisted (confirmed via regex match on the stored value, and confirmed the stored value isn't the raw token), matched successfully once via `tokenMatchesHash` against the real row, and — after verification — the same lookup query no longer returned that row (single-use enforced by the data itself, not just application logic). A separately created expired-token request was correctly excluded by the real `verificationExpiry > now()` filter. A never-issued token correctly matched nothing.

### 17.10 Real-database rate-limiting result

**Passed**, all against real Postgres writes: 5 submissions/hour per IP allowed, 6th blocked with a real `retryAfterSeconds`; 3 submissions/24h per normalised email enforced with case/whitespace variants of the same email correctly sharing one bucket and a 4th variant blocked; a real, persisted bucket's `expiresAt` was backdated directly and confirmed to stop blocking afterward; direct table inspection confirmed every stored `key` is a 64-hex-character HMAC digest containing neither the raw IP nor the raw/normalised email as a substring; exercising the authenticated in-app logic (`isSoleActiveAdmin`) was confirmed to leave the `rate_limit_buckets` row count completely unchanged. The 10-failed-attempt verification lockout was also confirmed for real: trips at exactly the 10th recorded failure, correctly scoped per guessing key (a different IP was unaffected), and a successful verification was confirmed not to count toward it.

### 17.11 Concurrency-test result

**Originally measured a real race — since fixed. See §18.** No unhandled exceptions from 8 concurrent requests against the same rate-limit key (max=5), but all 8 were measured as allowed in this run, with a final stored count of 1 (a fresh window was created mid-race by more than one of the concurrent calls) — a measured race overrun of 3 requests beyond the nominal max. This was the read-then-write race documented at the time as an accepted tradeoff (§16.1). It has since been replaced with a genuinely atomic implementation and re-validated — §18 has the root cause, the fix, and the repeated real-database results (20+ trials, zero overruns).

### 17.12 Retained-data inspection

**Passed**, after fixing a second test-script bug found on the first real run: the initial check used a crude substring blocklist (flagging any field name containing `"customer"`), which false-positived on `platformStripeCustomerId` — a legitimate field holding **Heimdell's own** Stripe reference for the organisation as a paying customer of RoundFlow, not any tenant's own end-customer's personal data. Fixed by replacing the blocklist with an exact allowlist of the `PlatformBillingRecord` model's real 12 fields; re-run confirmed the retained record contains only those fields, and a serialised-content scan confirmed no fixture email domain appears anywhere in the retained record's values.

### 17.13 Test totals

- **Real-database integration tests: 27 run, 27 passed, 0 failed** (after fixing the two test-script bugs described in §17.3 and §17.12 — both were flaws in the validation script's own assertions, not in the account-deletion/rate-limiting implementation itself).
- Existing mocked test suite (`npm test`): 63 passed, 1 documented `it.todo`, re-confirmed unchanged in this phase.
- `npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npx next build`: all re-run after every code change in this phase, all pass.
- `npx prisma migrate status` (against the staging database): confirmed up to date after `migrate deploy`.
- The staging database was confirmed **fully clean** after the run — `organizations`, `users`, `accountDeletionRequests`, `platformBillingRecords`, and `rateLimitBuckets` all independently counted at zero (a third bug — a scope-name mismatch between what the rate-limiting test phase created and what the cleanup step looked for — was found and fixed to achieve this; the first successful 27/27 run left 2 harmless leftover `rate_limit_buckets` rows, manually removed, then confirmed zero on a subsequent full re-run).

### 17.14 Failures or limitations

- Three bugs were found in this phase — **all three were in the validation script itself, not in the account-deletion/rate-limiting implementation being validated**: (1) a `pg_constraint` vs `pg_index` query mismatch for detecting the `RateLimitBucket` unique index, (2) an overly broad substring blocklist that false-positived on a legitimately-named, non-PII field, (3) a scope-name string mismatch between a test phase and its own cleanup step. All three are fixed in `scripts/validate-account-deletion-staging.ts`; a subsequent full re-run confirmed 27/27 passing with a fully clean database afterward.
- No production migration was run, attempted, or simulated against production or against `greenfixapp` at any point in this phase.
- This was a single validation run against one small, controlled fixture set — it is not a substitute for a sustained load/soak test (§12 item 6 still stands as a pre-launch recommendation for the rate limiter specifically).

### 17.15 Accountant decision still required

Unchanged from §15.1/§8. This run's retention-calculation phase reported, from a real, persisted `PlatformBillingRecord` row: starting point = subscription end date (the real timestamp `processOrganizationDeletion` recorded at the moment it ran), resulting retention expiry = that same date + 6 years. **The calculation still runs from the subscription end date, not from the end of Heimdell's financial year, and was not changed as part of this validation.** Accountant confirmation is still outstanding.

### 17.16 Exact production migration steps (documented only — NOT executed)

For when Andy has reviewed these results and approved deployment:

1. Take a Neon branch/snapshot of the production database immediately before migrating, so a point-in-time restore is available if anything goes wrong.
2. Run `DATABASE_URL=<production pooled URL> DATABASE_URL_UNPOOLED=<production direct URL> npx prisma migrate deploy` — applies the two new migrations (`20260805110000_account_deletion_requests`, `20260805150000_rate_limit_buckets`). Both are purely additive (three new tables total, two new nullable FK columns, zero drops, zero column-type changes to any existing table) — now confirmed to apply cleanly against a real, fresh Postgres instance in §17.2, though production is not fresh, so this should still be watched during the real run.
3. Confirm `AUTH_SECRET` is already set in the production environment (it already must be — no new secret is introduced by either phase).
4. Deploy the application code (Netlify) — **not performed in this task; requires separate, explicit authorisation.**
5. Smoke-test in production immediately after deploy: confirm `/legal/delete-account` loads, confirm the Settings "Danger zone"/"Your account" cards render for a real (non-fictional) test account, confirm `/admin/deletion-requests` loads for a platform admin. Do **not** submit a real deletion request against production data as part of this smoke test.

### 17.17 Rollback procedure

Unchanged from §14: both migrations remain purely additive (no dropped columns, no changed types, no destructive statements). If a rollback is ever needed: `DROP TABLE account_deletion_requests, platform_billing_records, rate_limit_buckets` and drop the three new enum types (`DeletionRequestType`, `DeletionRequestSource`, `DeletionRequestStatus`); no pre-existing table, column, or row is put at risk by either migration or by rolling either one back. This is now additionally supported by having watched all 17 migrations (including these two) apply cleanly to a real, fresh Postgres instance with no errors.

---

## 18. Phase 1.3: fixing the measured rate-limit concurrency race

**Status: complete. The race is fixed and re-validated against real PostgreSQL — 20/20 repeated concurrency trials passed with zero overruns, confirmed reproducible across two independent runs.** No schema/migration change was needed; this was a pure code-level fix in `lib/rate-limit.ts`.

### 18.1 Root cause

The previous `checkAndRecordRateLimit` and `recordFailedAttempt` both did a **read, then a decision, then a separate write**: `findUnique` → compare `count` against `max` in application code → `upsert`/`update`. Under real concurrency, multiple simultaneous requests targeting the same `(scope, key)` could each complete their `findUnique` (all seeing, say, `count = 4`, still under `max = 5`) *before any of their writes had committed* — a classic lost-update race. Each one would then independently decide "I'm allowed" and write its own increment, so more than `max` requests could be let through in a single burst. This was measured directly against real Postgres in §17.11 (3 of 8 concurrent requests overran a max of 5) — not a theoretical concern, an observed one.

### 18.2 Atomic fix chosen

Replaced both functions' read-then-write logic with a single new internal function, `atomicIncrementBucket()`, built on a single **`INSERT ... ON CONFLICT ("scope", "key") DO UPDATE`** statement (option 1 from this task's preferred list). One statement now does the read, the window-expiry decision, and the write together, inside Postgres itself:

```sql
INSERT INTO "rate_limit_buckets" ("id", "scope", "key", "count", "expiresAt", "createdAt", "updatedAt")
VALUES ($1, $2, $3, 1, $4, now(), now())
ON CONFLICT ("scope", "key") DO UPDATE SET
  "count" = CASE
    WHEN "rate_limit_buckets"."expiresAt" <= now() THEN 1
    ELSE "rate_limit_buckets"."count" + 1
  END,
  "expiresAt" = CASE
    WHEN "rate_limit_buckets"."expiresAt" <= now() THEN EXCLUDED."expiresAt"
    ELSE "rate_limit_buckets"."expiresAt"
  END,
  "updatedAt" = now()
RETURNING "count", "expiresAt"
```

Issued via `prisma.$queryRaw` as a tagged template — every value (`id`, `scope`, `key`, the fresh `expiresAt`) is a parameterised placeholder Prisma binds automatically; nothing is ever string-concatenated into the query text (requirement 4).

`checkAndRecordRateLimit` now calls this once, then decides `limited = count > max` from the *returned* post-increment count — it no longer reads a stale value and decides separately. `recordFailedAttempt` (the verification-lockout counter) had the exact same read-then-write shape and was fixed the same way, sharing the same `atomicIncrementBucket()` function, since leaving a second copy of the identical bug in a sibling code path would have been an incomplete fix. `isLockedOut` was left as a plain read (`findUnique`) — it never writes, so it isn't subject to a lost-update race; the actual write/decision for that limiter happens in `recordFailedAttempt`, which is now atomic.

### 18.3 Why this is safe

`INSERT ... ON CONFLICT DO UPDATE` is not "a read followed by a write" the way the old code was — it is Postgres's documented atomic upsert primitive. When two transactions conflict on the same target row, Postgres takes a row-level lock: the second transaction blocks until the first commits, then re-evaluates its `DO UPDATE` expressions against the *now-current, just-committed* row — this is Postgres's specific, documented read-committed-mode behaviour for this exact clause, not an incidental side effect. Consequences that matter here:

- **The increment can't be lost.** Every concurrent caller serialises on the row lock and sees the real, up-to-date `count` at the moment its own statement runs — not a value read moments earlier in a separate round trip.
- **The threshold decision is still correct even though every request increments first.** Each request's resulting `count` is unique and strictly increasing (1, 2, 3, …) in whatever order Postgres serialises them — so under 8 concurrent requests with `max = 5`, exactly the requests that land on counts 1–5 are allowed and exactly the ones landing on 6–8 are blocked, deterministically, every time (proven over 20 real-database trials — see §18.4).
- **Window-expiry reset is atomic too**, not a separate step: the `CASE WHEN "expiresAt" <= now()` check runs against the current row at write time. Two simultaneous requests exactly at a window's expiry can't both "win" the reset — whichever the row lock serialises second sees the *other's* already-committed reset and correctly increments on top of it instead of resetting again (proven in §18.4's boundary test: final count is exactly 2, not 1).
- **No duplicate-key error is possible from this statement at all** — `ON CONFLICT` is precisely Postgres's mechanism for turning what would otherwise be a unique-constraint violation into a defined, atomic update instead. There is no code path here that can raise `P2002`/a unique-constraint error for the caller to accidentally leak, so there was nothing new to add a try/catch around (requirement 8 is satisfied by construction, not by suppression).
- **HMAC-hashed keys, the existing expiry windows, the existing IP/email limits, generic non-enumerating responses, and the existing opportunistic cleanup sweep are all unchanged** — this fix only replaces *how* the counter is incremented, not what is stored, how it's hashed, what the limits are, or what the caller-facing behaviour looks like on a block.
- **No new dependency, no in-memory state.** `$queryRaw` is part of `@prisma/client`, already a project dependency; the counter remains entirely Postgres-backed, so it stays correct across Netlify's distributed serverless instances exactly as before.

Postgres's isolation model did **not** prevent a reliable atomic implementation — the earlier, simpler `findUnique` → `upsert`/`update` approach simply wasn't using the right primitive for the job. No stop condition from this task was triggered.

### 18.4 Real-database concurrency results

Run against the same isolated `roundflow-google-play-staging` Neon project used throughout Phase 1.2 (never production, never `greenfixapp`) — full detail in `scripts/validate-account-deletion-staging.ts`, section "13. Concurrency / unique-constraint behaviour":

- **Repeated trials (8 simultaneous requests, max = 5, run 20 times, fresh key per trial):**
  - Every one of the 20 trials allowed **exactly 5** and blocked **exactly 3** — zero exceptions.
  - The final stored counter was **exactly 8** in all 20 trials (values: `8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8`) — every one of the 8 concurrent increments was preserved, none lost.
  - **Zero unhandled exceptions** across all 160 concurrent requests issued (20 trials × 8) — no unique-constraint error ever reached application code.
  - The entire 20-trial run was independently repeated a second time (a fresh `tsx` process, fresh connections) with identical results: 20/20 trials, zero overruns, final count 8 every time.
- **Window-reset boundary test** (2 simultaneous requests exactly as a window expires): final stored count was **exactly 2** — one atomic reset-to-1 and one atomic increment-to-2, never two independent resets to 1 (which would have silently lost a count).
- **Cross-key isolation under concurrency** (10 concurrent requests split across 2 distinct keys, 5 each): each key's final count was **exactly 5**, with no cross-contamination.
- All other real-database rate-limiting checks from Phase 1.2 (§17.10) were re-run and still pass unchanged: 5/hour-per-IP and 3/24h-per-email limits, email case/whitespace normalisation, window-expiry recovery, raw IP/email never persisted (only the 64-hex-character HMAC digest), and authenticated in-app deletion activity leaving `rate_limit_buckets` completely untouched.
- Full staging run: **29/29 phases passed** (the 27 from Phase 1.2 plus the 2 new phases this fix added — the repeated-trials test and the boundary test — plus the pre-existing single-key-and-two-different-keys concurrency phase was split into three distinct phases for clarity, hence 29 rather than 28).
- The staging database was confirmed fully clean (`organizations`, `users`, `accountDeletionRequests`, `platformBillingRecords`, `rateLimitBuckets` all zero) after both full runs.

### 18.5 Remaining limitation

None found in this fix specifically. The only carried-over limitation from Phase 1.2 still applies generally: these are controlled validation runs against fictional fixtures on a small scale, not a sustained production load/soak test — still recommended as a pre-launch check (§12 item 6) for observing behaviour under real, larger-scale concurrent traffic, though the *correctness* of the atomic operation itself is no longer in question — it is now proven, not assumed, at the scale tested (8-way concurrency, 20 repeated trials, two independent runs).

---

## 19. Phase 1.4: PlatformBillingRecord retention calculation updated to Heimdell's confirmed financial year end

**Status: complete.** Heimdell Tech Ai Ltd's financial year end has been confirmed as **31 May**. The retention-expiry calculation for `PlatformBillingRecord` — previously a flagged placeholder ("6 years from the raw transaction/subscription-end date," explicitly documented in §8/§15.1 as pending exactly this confirmation) — has been updated to the standard UK Companies Act 2006 / HMRC formulation: six years after the end of the financial year the underlying billing transaction falls into. No schema or migration change was needed; this was a pure calculation-logic change in `lib/account-deletion.ts`, confirmed against real PostgreSQL.

### 19.1 Heimdell financial year end

**31 May**, confirmed policy (Heimdell Tech Ai Ltd).

### 19.2 Calculation method

`calculateBillingRetentionDate(transactionDate)`:

1. Read `transactionDate`'s **UTC** calendar year and month (`getUTCFullYear()` / `getUTCMonth()`) — never local-timezone getters, so the result can never shift with the server's timezone or a daylight-saving transition.
2. A date in **January–May** belongs to the financial year ending **that same year's** 31 May. A date in **June–December** belongs to the financial year ending the **following** year's 31 May. (May always has 31 days, so "any date in May" is unconditionally "on or before 31 May" — no day-of-month check is needed for this branch.)
3. Add exactly **6** to that financial-year-end year.
4. Return `31 May` of the resulting year, at **23:59:59.999 UTC** — the clearly documented UTC boundary this function always returns (e.g. `2032-05-31T23:59:59.999Z`), constructed directly via `Date.UTC(year, 4, 31, 23, 59, 59, 999)` rather than a date-arithmetic library's local-timezone-based year-add, to make the UTC-safety and DST-immunity a property of the construction itself, not an assumption about a dependency's internals.

Leap years have no effect on this calculation at all: every code path only ever touches the month/year components and the fixed value "31 May" — the calculation never passes through 29 February, so a leap year changes nothing about the result (confirmed by test and by real-database validation, §19.4).

**What the calculation is deliberately *not* based on** (per explicit requirement): not the subscription cancellation date, not the account-deletion-processing date, not a flat "6 years from the transaction date" with no financial-year rounding. See §19.3 for what it *is* based on in this system.

### 19.3 Which date counts as "the transaction date"

`processOrganizationDeletion()` (`lib/account-deletion.ts`) now feeds `Organization.currentPeriodEnd` into the calculation — the end of the last period Heimdell actually billed the organisation for, synced directly from Stripe's own `subscription.current_period_end` (a genuine billing fact, not an artifact of when deletion happened to be processed). It falls back to the deletion-processing moment (`subscriptionEndedAt`, `new Date()`) **only** when no billed period was ever recorded (e.g. an organisation deleted before Stripe confirmed one) — in that specific case there genuinely is no earlier transaction date to anchor to, which is the explicitly permitted exception ("record creation date, unless that is genuinely the underlying transaction date").

### 19.4 Worked examples (confirmed against real PostgreSQL, not just unit tests)

| Transaction date | Financial year ends | Retention expiry |
|---|---|---|
| 20 May 2026 | 31 May 2026 | **31 May 2032** |
| 5 August 2026 | 31 May 2027 | **31 May 2033** |
| 31 May 2027 | 31 May 2027 | **31 May 2033** |
| 1 June 2027 | 31 May 2028 | **31 May 2034** |

All four were run through the real, deployed `calculateBillingRetentionDate()` function in `scripts/validate-account-deletion-staging.ts` and matched exactly. Additionally, Organization A's staging fixture was given a real `currentPeriodEnd` of 5 August 2026, and processing its deletion produced a **real, persisted** `PlatformBillingRecord.retainedUntil` of `2033-05-31T23:59:59.999Z` — proving the calculation is correctly wired end-to-end through the actual deletion-processing code path against a real database, not only exercised as an isolated pure function.

### 19.5 Test results

- **13 new/updated unit tests** in `tests/account-deletion-core.test.ts` (replacing the single old "six years flat" test): 30 May, 31 May, 1 June, end-of-calendar-year boundaries (31 December / 1 January), two leap-year cases (a 29 February input, and a financial-year-end that itself falls in a leap year), explicit UTC-boundary behaviour (31 May 23:59:59.999Z vs 1 June 00:00:00.000Z resolving to different financial years), all four confirmed worked examples, and the no-argument default-to-today path.
- **2 new tests** in `tests/admin-deletion-queue-actions.test.ts`: `processOrganizationDeletionRequestAction` computes the correct `retainedUntil` from a mocked `currentPeriodEnd`, and correctly falls back to the processing moment when `currentPeriodEnd` is absent.
- **Mocked suite total: 77 passed, 1 documented `it.todo`** (up from 63 — the net effect of the above).
- **Real-database validation (`npm run validate:staging`): 32/32 phases passed**, including 4 new phases specific to this change: the four worked examples, the UTC-boundary case, the leap-year case, and confirmation that the real, persisted billing record from this run's organisation deletion matches the expected 31 May 2033. The staging database was confirmed fully clean afterward.
- `npm run lint`, `npx tsc --noEmit`, `npx prisma validate` (no schema change was needed or made), and `npx next build` all pass.

### 19.6 Exceptional circumstances requiring longer retention

The six-year-from-financial-year-end calculation is the **normal** rule. It is explicitly **not** automatically extended by this system for any of the following — no signal exists anywhere in this codebase to detect them, so building automatic extension would risk silently getting it wrong:

- A transaction that spans multiple accounting periods.
- A relevant Heimdell company tax return that was filed late.
- HMRC opening a compliance check that touches the period in question.
- Any other documented legal hold (e.g. anticipated or actual litigation).

**No legal-hold mechanism exists in this codebase** (checked before making this change — no such model, flag, or process is present anywhere in the project). Per the explicit instruction to document this as a future operational procedure rather than silently extending every record: if any of the above applies to a specific organisation's `PlatformBillingRecord`, an authorised person (Andy, or Heimdell's accountant with Andy's sign-off) must manually update that record's `retainedUntil` (and ideally its `retentionReason`) directly, and note the reason and authority for the change outside this system (e.g. in Heimdell's own accounting/compliance records) until a proper legal-hold capability is built. This is a manual, exceptional, authorised action — not a code path — and is deliberately not automated here.

### 19.7 Confirmation: tenant operational records are still fully deleted

Unchanged by this phase. This was a pure calculation-logic change to one Heimdell-only accounting record; it does not touch, retain, or extend retention of any tenant data. Re-confirmed in this phase's real-database run (§19.4): organisation deletion still removed every tenant row (users, customers, properties, jobs, rounds, services, notifications, transactions) via the same schema-level cascade as before, and the retained `PlatformBillingRecord` still contains exactly its documented 12 fields — no tenant customer names, addresses, emails, phone numbers, photos, job records, worker details, password hashes, payment credentials, webhook secrets, or push tokens.

---

## Summary

- **Implementation status:** Complete for the scope defined across all five phases — Phase 1 (schema, migration, in-app individual/organisation deletion flows, public deletion-request page and email verification, platform-admin processing queue, privacy-policy updates), Phase 1.1 (rate limiting / abuse protection for the public form), Phase 1.2 (real-PostgreSQL staging validation, §17), Phase 1.3 (fixing the measured rate-limit concurrency race, §18), and Phase 1.4 (updating the `PlatformBillingRecord` retention calculation to Heimdell's confirmed 31 May financial year end, §19). Not deployed to Netlify, not migrated against production, not pushed, in any phase.
- **Real-database validation status:** **Complete — 32/32 phases passed** against a dedicated, isolated Neon project (`roundflow-google-play-staging`, confirmed separate from `greenfixapp`/production). All 17 project migrations applied cleanly to a fresh instance; the staging database was left fully clean afterward.
- **Rate-limit concurrency race:** **Fixed** (§18) — a single atomic `INSERT ... ON CONFLICT DO UPDATE` replaced the earlier read-then-write counter. 20 repeated real-database trials of 8 simultaneous requests against a limit of 5: every trial allowed exactly 5, blocked exactly 3, final counter exactly 8 — zero overruns, reproduced on a second independent run.
- **Billing retention calculation:** **Updated** (§19) — now six years after the end of the Heimdell financial year (confirmed 31 May) the underlying billing transaction falls into, replacing the earlier flat "6 years from the raw date" placeholder. All four confirmed worked examples (20 May, 5 Aug, 31 May, 1 Jun) match exactly, verified both as a pure function and as a real, persisted `PlatformBillingRecord` row from an actual `processOrganizationDeletion()` run.
- **Google Play in-app deletion requirement:** Met in-app (Settings → delete account / danger zone) and confirmed end-to-end against a real database (§17.5).
- **Public deletion-resource requirement:** Met — `/legal/delete-account` works without authentication, names RoundFlow and Heimdell Tech Ai Ltd, includes a working request form, and that form's rate limiting is confirmed atomic and race-free against real Postgres writes (§18.4).
- **Actual data deletion:** Confirmed against a real database — individual accounts are anonymised (not just disabled), and organisation deletion cascades to delete all tenant operational data (§17.6, re-confirmed in §19.7).
- **What remains after deletion:** Confirmed against a real, persisted row — a minimised `AccountDeletionRequest` audit row, a `PlatformBillingRecord` for organisations containing exactly its documented 12 fields and no tenant customer data (retained until 6 years after the relevant Heimdell financial year end), and short-lived `RateLimitBucket` rows (a scope name, a 64-character HMAC hash, and a count).
- **Tests:** 77 automated (mocked) tests passing plus 1 documented `it.todo`, **plus 32/32 real-database integration tests passing** (`scripts/validate-account-deletion-staging.ts` / `npm run validate:staging`). Lint, typecheck, Prisma schema validation (no schema change was needed), `prisma migrate status` (against staging), and `next build` all pass.
- **Blockers requiring Andy's decision before deployment:** (1) awareness of the "per guessing IP" reinterpretation of the verification-lockout requirement (§15.5); (2) the documented-but-not-yet-built manual legal-hold procedure (§19.6) — an operational process, not a code gap, for the rare case a record needs to be retained longer than the normal 6-years-from-FY-end rule. The six-year retention-basis assumption and the rate-limiter concurrency race (both previously listed here) are now resolved — no database, migration, or code-level blocker remains.
