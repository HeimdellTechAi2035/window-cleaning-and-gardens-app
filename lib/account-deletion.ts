import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getPlatformStripe } from "@/lib/platform-billing";

// ------------------------------------------------------------------
// Verification tokens (public web deletion requests)
// ------------------------------------------------------------------

const TOKEN_BYTES = 32;
const TOKEN_TTL_HOURS = 48;

/** Generates a raw token (goes in the emailed link) and its hash (goes in the DB). Never store the raw value. */
export function generateVerificationToken(): { token: string; tokenHash: string; expiry: Date } {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(token);
  const expiry = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
  return { token, tokenHash, expiry };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Timing-safe equality check for a raw token against a stored hash. */
export function tokenMatchesHash(token: string, storedHash: string): boolean {
  const candidateHash = hashToken(token);
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ------------------------------------------------------------------
// Retention / deadline calculations
// ------------------------------------------------------------------

/**
 * One calendar month from the point a request becomes actionable
 * (verified, or immediately for an already-authenticated in-app request) —
 * the processing deadline required by Play/GDPR-style deletion policies.
 */
export function calculateProcessingDeadline(from: Date = new Date()): Date {
  return addMonths(from, 1);
}

/**
 * Heimdell Tech Ai Ltd's financial year ends 31 May (confirmed policy).
 * Returns the 31 May that closes the financial year `transactionDate` falls
 * into: a date in January–May belongs to the financial year ending that
 * same year's 31 May; a date in June–December belongs to the financial
 * year ending the *following* year's 31 May. Computed entirely from UTC
 * calendar fields (`getUTCFullYear`/`getUTCMonth`) so the result can never
 * shift with the server's local timezone or a daylight-saving transition,
 * and is unaffected by leap years (29 February never touches 31 May).
 */
function heimdellFinancialYearEnd(transactionDate: Date): Date {
  const year = transactionDate.getUTCFullYear();
  const month = transactionDate.getUTCMonth(); // 0-indexed: Jan=0 … May=4 … Dec=11
  const isOnOrBeforeMay31 = month <= 4; // any day in Jan–May is on or before that year's 31 May
  const financialYearEndYear = isOnOrBeforeMay31 ? year : year + 1;
  // 31 May, end of day UTC — the clearly-documented UTC boundary this
  // function returns: 2026-05-31T23:59:59.999Z, never a local-midnight value
  // that could land on a different calendar day once converted to UTC.
  return new Date(Date.UTC(financialYearEndYear, 4, 31, 23, 59, 59, 999));
}

/**
 * Retention expiry for Heimdell's own PlatformBillingRecord accounting
 * records: six years after the end of the Heimdell financial year (31 May)
 * in which `transactionDate` falls — the standard UK Companies Act 2006 /
 * HMRC record-keeping formulation, now that Heimdell's financial year end
 * has been confirmed as 31 May.
 *
 * `transactionDate` must be the underlying billing/transaction date — e.g.
 * the end of the last period Heimdell actually billed the organisation for
 * (see processOrganizationDeletion's use of Organization.currentPeriodEnd)
 * — never an administrative date such as when a subscription was cancelled
 * or when an account-deletion request happened to be processed, and never
 * "six years from the transaction date" without first rounding up to the
 * financial year end.
 *
 * Worked examples (confirmed against Heimdell's policy):
 *   20 May 2026 -> FY ending 31 May 2026 -> retained until 31 May 2032
 *    5 Aug 2026 -> FY ending 31 May 2027 -> retained until 31 May 2033
 *   31 May 2027 -> FY ending 31 May 2027 -> retained until 31 May 2033
 *    1 Jun 2027 -> FY ending 31 May 2028 -> retained until 31 May 2034
 *
 * Longer retention may exceptionally be required — e.g. a transaction
 * spanning multiple accounting periods, a late-filed company tax return, an
 * open HMRC compliance check, or another documented legal hold. This
 * function does not, and must not, automatically extend retention for
 * those cases: no automated signal exists in this system to detect them.
 * They require an authorised manual legal-hold decision instead — see
 * docs/google-play-account-deletion-implementation.md for the documented
 * (not yet built) operational procedure.
 */
export function calculateBillingRetentionDate(transactionDate: Date = new Date()): Date {
  const financialYearEnd = heimdellFinancialYearEnd(transactionDate);
  return new Date(Date.UTC(financialYearEnd.getUTCFullYear() + 6, 4, 31, 23, 59, 59, 999));
}

// ------------------------------------------------------------------
// User anonymisation
// ------------------------------------------------------------------

/**
 * Anonymises a user in place rather than deleting the row. This is
 * deliberate: Job.assignedWorker/completedByWorker reference User, and
 * historical job records must keep showing *something* for "who did this
 * job" without retaining that person's actual identity — anonymising the
 * row means every existing screen that renders `assignedWorker.name`
 * automatically shows "Former user" with no UI changes required, and it
 * naturally prevents login (passwordHash cleared + isActive false, both
 * independently checked in lib/auth.ts's authorize()) without needing a
 * denylist or extra check anywhere else.
 */
export async function anonymizeUser(userId: string): Promise<void> {
  const anonymizedEmail = `deleted-${userId}@deleted.roundflow.invalid`;

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        name: "Former user",
        email: anonymizedEmail,
        phone: null,
        image: null,
        passwordHash: null,
        isActive: false,
      },
    }),
  ]);
}

/**
 * True if `userId` is the organization's only active ADMIN — used to block
 * individual self-deletion that would leave the organization ownerless.
 * Returns false for a non-admin or already-inactive requester, since
 * neither of those can leave the org ownerless by deleting themselves.
 */
export async function isSoleActiveAdmin(userId: string, organizationId: string): Promise<boolean> {
  const requester = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!requester || requester.role !== "ADMIN" || !requester.isActive) return false;

  const activeAdminCount = await prisma.user.count({
    where: { organizationId, role: "ADMIN", isActive: true },
  });
  return activeAdminCount <= 1;
}

// ------------------------------------------------------------------
// Organization deletion processing
// ------------------------------------------------------------------

/**
 * Cancels the organization's RoundFlow platform subscription (if any),
 * snapshots the minimal accounting record Heimdell is entitled to keep,
 * then deletes the organization — which cascades at the database level to
 * every user, customer, property, round, job, service, transaction,
 * notification, and property hazard belonging to it (see schema.prisma).
 *
 * Idempotent: safe to call again on a request that was already processed
 * — if the organization is already gone, this is a no-op that reports as
 * such rather than erroring, so a retried "Process" click can never double
 * -cancel a subscription or create a duplicate billing record.
 */
export async function processOrganizationDeletion(params: {
  organizationId: string;
  deletionRequestId: string;
}): Promise<{ alreadyDeleted: boolean; retainedUntil?: Date }> {
  const org = await prisma.organization.findUnique({ where: { id: params.organizationId } });
  if (!org) {
    return { alreadyDeleted: true };
  }

  let lastSubscriptionStatus = org.subscriptionStatus;

  if (org.platformStripeSubscriptionId && process.env.PLATFORM_STRIPE_SECRET_KEY) {
    try {
      const stripe = getPlatformStripe();
      const subscription = await stripe.subscriptions.retrieve(org.platformStripeSubscriptionId);
      if (subscription.status !== "canceled") {
        const cancelled = await stripe.subscriptions.cancel(org.platformStripeSubscriptionId);
        lastSubscriptionStatus = cancelled.status;
      } else {
        lastSubscriptionStatus = subscription.status;
      }
    } catch (err) {
      // Already cancelled, already gone, or Stripe unreachable — never let
      // a billing-cleanup failure block the actual deletion.
      console.error("Failed to cancel platform subscription during org deletion:", err);
    }
  }

  const subscriptionEndedAt = new Date();
  // The retention clock runs from the underlying billing transaction date —
  // Organization.currentPeriodEnd (synced from Stripe's own
  // subscription.current_period_end: the end of the last period Heimdell
  // actually billed this organisation for) — never from subscriptionEndedAt
  // above, which is only an administrative timestamp of when this deletion
  // happened to be processed, not of any billable transaction. Falls back
  // to that processing moment only if no billed period was ever recorded
  // (e.g. the organisation was deleted before Stripe confirmed one), since
  // in that case there genuinely is no earlier transaction date to anchor to.
  const billingTransactionDate = org.currentPeriodEnd ?? subscriptionEndedAt;
  const retainedUntil = calculateBillingRetentionDate(billingTransactionDate);

  await prisma.platformBillingRecord.create({
    data: {
      organizationName: org.name,
      organizationSlug: org.slug,
      platformStripeCustomerId: org.platformStripeCustomerId,
      platformStripeSubscriptionId: org.platformStripeSubscriptionId,
      lastSubscriptionStatus,
      subscriptionStartedAt: org.createdAt,
      subscriptionEndedAt,
      deletionRequestId: params.deletionRequestId,
      retainedUntil,
    },
  });

  await prisma.organization.delete({ where: { id: params.organizationId } });

  return { alreadyDeleted: false, retainedUntil };
}

/**
 * Cancels the organization's future RoundFlow billing immediately when a
 * deletion request is first made — separate from (and earlier than) the
 * actual destructive processing above, so "don't charge after a verified
 * request" holds even while the request is still sitting in the queue.
 * Safe to call multiple times.
 */
export async function cancelFutureBillingForOrganization(organizationId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { platformStripeSubscriptionId: true, subscriptionStatus: true },
  });
  if (!org?.platformStripeSubscriptionId) return;
  if (!process.env.PLATFORM_STRIPE_SECRET_KEY) return;
  if (org.subscriptionStatus === "canceled") return;

  try {
    const stripe = getPlatformStripe();
    await stripe.subscriptions.cancel(org.platformStripeSubscriptionId);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: "canceled" },
    });
  } catch (err) {
    console.error("Failed to cancel future billing on deletion request:", err);
  }
}
