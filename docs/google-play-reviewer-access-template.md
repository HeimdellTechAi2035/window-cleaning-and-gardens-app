# Google Play reviewer access — template

**This file intentionally contains no credentials.** The actual password is generated fresh each time by the platform-admin "Create reviewer account" / "Regenerate password" actions (`/admin/google-play-reviewer`), shown once on screen, and never written to this file, any other tracked file, or any log.

## What this is

A single, dedicated, fictional demonstration organisation (`RoundFlow Google Play Demo`) that a Google Play reviewer can log into and use immediately — no payment, no email verification, no OTP, no manual approval — populated with obviously fictional demo data (customers, properties, jobs, rounds, workers, financial records). It contains no real GreenFix or customer data, and never triggers a real Stripe/GoCardless charge.

## How to (re)generate reviewer access before a Play Console submission

1. Sign in to the platform-admin panel at `/admin` (the separate, hand-rolled admin session — not the tenant login).
2. Open **Play reviewer access** (`/admin/google-play-reviewer`).
3. Click **Create reviewer account** (safe to click even if it already exists — it's idempotent and won't create a duplicate organisation).
4. The screen will show the email, a freshly generated password, the login URL, and ready-to-paste Play Console "App Access" instructions, in this format:

```
ROUND FLOW GOOGLE PLAY REVIEWER ACCESS

Login URL:
[production login URL]

Email:
googleplay-review@heimdell-tech-ai.co.uk

Password:
[freshly generated — shown once]

Instructions:
This account provides administrator access to a fictional demonstration organisation. No payment, email verification, OTP or additional approval is required. The account contains fictional customers, properties, jobs, routes, workers and financial records so all major RoundFlow features can be reviewed immediately.

Available areas:
- Dashboard
- Planner
- Rounds
- Customers
- Route Map
- Financials
- Settings
- Job completion
- Photo upload workflow

No genuine customer or GreenFix data is included.
```

5. Copy that block (there's a copy button) and paste it directly into the Play Console's "App access" → "All functionality is available without special access" → login instructions field.
6. Save the password somewhere appropriate for your organisation (a password manager, not this repo) — it cannot be retrieved again once you leave that screen. If you lose it, click **Regenerate password** to issue a new one.

## Resetting demo data for a future review

Click **Reset demo data** on the same page before each new submission cycle if you want a clean, fresh set of fictional records. This only ever touches the reviewer organisation's own data — it cannot affect any real tenant, including GreenFix.

## Disabling access

Click **Disable reviewer access** to immediately block that one account from signing in (without deleting the organisation or its demo data), if you ever need to revoke access between review cycles.

## Security notes

- The reviewer organisation is located internally by its own fixed identifier — no admin action here ever accepts an arbitrary organisation ID from the browser, so there's no way to redirect these actions at a real tenant.
- Every action on this page requires an authenticated platform-admin session (`requireSuperAdmin()`) — normal tenant administrators, including the reviewer account itself, cannot reach it.
- The reviewer organisation is exempt from real billing only because its `subscriptionStatus` is set to `active` directly (the same mechanism already used for other manual overrides) — it never has real Stripe customer/subscription IDs, so it can never enter Stripe Checkout or receive a real charge.
- The generated password is stored only as a bcrypt hash, identical to every other user account in this system.
