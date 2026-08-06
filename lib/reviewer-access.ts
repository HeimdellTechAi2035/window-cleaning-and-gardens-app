import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

// ------------------------------------------------------------------
// Google Play reviewer/demo tenant — a single, well-known, fictional
// organisation that lets a Google Play reviewer log in and use every major
// RoundFlow feature immediately, with no payment, no email verification,
// no OTP, and no manual approval delay. Everything here is gated by
// requireSuperAdmin() at the call site (app/actions/reviewer-access.ts) —
// nothing in this file is reachable from any tenant-facing code path.
//
// The reviewer organisation is always located by ITS OWN fixed slug below
// — never by an admin-supplied organizationId — so there is no way for a
// browser-submitted value to make an arbitrary real organisation "become"
// the reviewer tenant.
// ------------------------------------------------------------------

export const REVIEWER_ORG_SLUG = "roundflow-google-play-demo";
export const REVIEWER_ORG_NAME = "RoundFlow Google Play Demo";
export const REVIEWER_EMAIL = "googleplay-review@heimdell-tech-ai.co.uk";

const WORKER_EMAILS = {
  alex: "alex.example@demo.roundflow.invalid",
  jordan: "jordan.test@demo.roundflow.invalid",
} as const;

// A 1x1 transparent PNG — an obviously-placeholder image, not a real photo,
// used everywhere the job-completion UI expects a beforePhotoUrl/afterPhotoUrl.
const PLACEHOLDER_PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function randomPassword(): string {
  // Human-typeable temp password: e.g. "bright-otter-4821" — same pattern
  // already used by resetUserPasswordAsAdminAction (app/actions/super-admin.ts)
  // and inviteTeamMemberAction (app/actions/organization.ts). Every random
  // component uses crypto.randomInt() (cryptographically secure), never
  // Math.random() — this value grants real account access, including to
  // the Google Play reviewer organisation.
  const words = ["bright", "quiet", "swift", "amber", "coral", "misty", "otter", "cedar", "lunar", "ember"];
  const pick = () => words[randomInt(0, words.length)];
  return `${pick()}-${pick()}-${randomInt(1000, 10000)}`;
}

export interface ReviewerAccessStatus {
  exists: boolean;
  organizationId: string | null;
  organizationName: string | null;
  isActive: boolean | null;
  subscriptionStatus: string | null;
  reviewerDemoDataResetAt: Date | null;
  demoRecordCount: number;
}

/** Read-only status for the admin page — never returns or touches a password. */
export async function getReviewerAccessStatus(): Promise<ReviewerAccessStatus> {
  const org = await prisma.organization.findUnique({ where: { slug: REVIEWER_ORG_SLUG } });
  if (!org) {
    return {
      exists: false,
      organizationId: null,
      organizationName: null,
      isActive: null,
      subscriptionStatus: null,
      reviewerDemoDataResetAt: null,
      demoRecordCount: 0,
    };
  }

  const [reviewerUser, customerCount, jobCount, roundCount, userCount] = await Promise.all([
    prisma.user.findUnique({ where: { email: REVIEWER_EMAIL }, select: { isActive: true } }),
    prisma.customer.count({ where: { organizationId: org.id } }),
    prisma.job.count({ where: { organizationId: org.id } }),
    prisma.round.count({ where: { organizationId: org.id } }),
    prisma.user.count({ where: { organizationId: org.id } }),
  ]);

  return {
    exists: true,
    organizationId: org.id,
    organizationName: org.name,
    isActive: reviewerUser?.isActive ?? null,
    subscriptionStatus: org.subscriptionStatus,
    reviewerDemoDataResetAt: org.reviewerDemoDataResetAt,
    demoRecordCount: customerCount + jobCount + roundCount + userCount,
  };
}

async function getReviewerOrganisationOrThrow() {
  const org = await prisma.organization.findUnique({ where: { slug: REVIEWER_ORG_SLUG } });
  if (!org) throw new Error("The reviewer organisation doesn't exist yet — create it first.");
  return org;
}

/**
 * Idempotently ensures the reviewer organisation + reviewer admin user
 * exist, correctly configured, with a freshly-generated password. Safe to
 * call repeatedly (e.g. before every future Google Play review) — never
 * creates a second reviewer organisation, and only populates demo data if
 * none exists yet (use resetReviewerDemoData() for a full data refresh).
 */
export async function createOrEnsureReviewerAccount(): Promise<{ tempPassword: string; organizationId: string }> {
  let org = await prisma.organization.findUnique({ where: { slug: REVIEWER_ORG_SLUG } });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: REVIEWER_ORG_NAME,
        slug: REVIEWER_ORG_SLUG,
        timezone: "Europe/London",
        isReviewerOrganisation: true,
        subscriptionStatus: "active", // never a real Stripe subscription — see lib/reviewer-access.ts module comment
      },
    });
  } else {
    // Idempotent re-assertion, in case anything drifted.
    org = await prisma.organization.update({
      where: { id: org.id },
      data: { isReviewerOrganisation: true, subscriptionStatus: "active", name: REVIEWER_ORG_NAME },
    });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: REVIEWER_EMAIL } });
  if (existingUser && existingUser.organizationId !== org.id) {
    // Should be structurally impossible (the org is always located by its
    // own fixed slug, never supplied externally) — refuse rather than
    // silently taking over an unrelated account if it somehow happens.
    throw new Error(`${REVIEWER_EMAIL} exists but is not linked to the reviewer organisation.`);
  }

  const tempPassword = randomPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { passwordHash, role: "ADMIN", isActive: true, name: "Google Play Reviewer" },
    });
  } else {
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email: REVIEWER_EMAIL,
        name: "Google Play Reviewer",
        role: "ADMIN",
        passwordHash,
        isActive: true,
      },
    });
  }

  const customerCount = await prisma.customer.count({ where: { organizationId: org.id } });
  if (customerCount === 0) {
    await populateReviewerDemoData(org.id);
    await prisma.organization.update({ where: { id: org.id }, data: { reviewerDemoDataResetAt: new Date() } });
  }

  return { tempPassword, organizationId: org.id };
}

/** Generates and stores a fresh password for the existing reviewer user, and re-activates it. */
export async function regenerateReviewerPassword(): Promise<{ tempPassword: string }> {
  const org = await getReviewerOrganisationOrThrow();
  const user = await prisma.user.findUniqueOrThrow({ where: { email: REVIEWER_EMAIL } });
  if (user.organizationId !== org.id) {
    throw new Error(`${REVIEWER_EMAIL} is not linked to the reviewer organisation.`);
  }

  const tempPassword = randomPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, isActive: true } });

  return { tempPassword };
}

/** Blocks the reviewer account from signing in — reuses the exact same isActive gate lib/auth.ts already enforces for every user. */
export async function disableReviewerAccess(): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: REVIEWER_EMAIL } });
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
}

/**
 * Wipes and regenerates the reviewer organisation's demo data — customers,
 * properties, rounds, jobs, services, transactions, notifications, and
 * OPERATIVE-role workers. Never touches the reviewer admin user, its
 * password, or any other organisation. Safe to run before every future
 * Google Play review cycle.
 */
export async function resetReviewerDemoData(): Promise<void> {
  const org = await getReviewerOrganisationOrThrow();
  await wipeReviewerDemoData(org.id);
  await populateReviewerDemoData(org.id);
  await prisma.organization.update({ where: { id: org.id }, data: { reviewerDemoDataResetAt: new Date() } });
}

async function wipeReviewerDemoData(organizationId: string): Promise<void> {
  // Deleting Customers and Rounds cascades at the database level (see
  // schema.prisma / the "cascade_customer_delete" and
  // "cascade_job_round_property_service" migrations) to Properties,
  // PropertyHazards, Services, Jobs, Transactions, and Notifications.
  // OPERATIVE-role Users are not cascade-children of either, so deleted
  // separately. Everything here is explicitly scoped to this one
  // organizationId — never any other organisation's data.
  await prisma.customer.deleteMany({ where: { organizationId } });
  await prisma.round.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId, role: "OPERATIVE" } });
}

async function populateReviewerDemoData(organizationId: string): Promise<void> {
  const worker1 = await prisma.user.upsert({
    where: { email: WORKER_EMAILS.alex },
    create: { organizationId, email: WORKER_EMAILS.alex, name: "Alex Example", role: "OPERATIVE", isActive: true },
    update: { organizationId, name: "Alex Example", role: "OPERATIVE", isActive: true },
  });
  const worker2 = await prisma.user.upsert({
    where: { email: WORKER_EMAILS.jordan },
    create: { organizationId, email: WORKER_EMAILS.jordan, name: "Jordan Test", role: "OPERATIVE", isActive: true },
    update: { organizationId, name: "Jordan Test", role: "OPERATIVE", isActive: true },
  });

  const windowRound = await prisma.round.create({
    data: { organizationId, name: "Sampleford Window Round", description: "Fictional demo round — window cleaning", colorCode: "#6366f1" },
  });
  const gardenRound = await prisma.round.create({
    data: { organizationId, name: "Sampleford Garden & Exterior Round", description: "Fictional demo round — gardening & exterior maintenance", colorCode: "#22c55e" },
  });

  // 6 fictional customers, each at a clearly-fictional UK-style address in
  // the invented town "Sampleford" — never a real GreenFix/Heimdell
  // location. Phone numbers use Ofcom's officially reserved fictional
  // range (07700 900xxx) so they can never collide with a real number.
  const customerFixtures = [
    { name: "Demo Customer One", address: "1 Sample Street", round: windowRound, service: "Standard Window Clean", price: 20, phone: "07700 900001" },
    { name: "Demo Customer Two", address: "12 Fictional Avenue", round: gardenRound, service: "Lawn Mowing & Edging", price: 35, phone: "07700 900002" },
    { name: "Demo Customer Three", address: "3 Test Gardens", round: windowRound, service: "Standard Window Clean", price: 22, phone: "07700 900003" },
    { name: "Demo Customer Four", address: "8 Example Close", round: gardenRound, service: "Gutter Clearing", price: 60, phone: "07700 900004" },
    { name: "Demo Customer Five", address: "15 Placeholder Lane", round: gardenRound, service: "Hedge Trimming", price: 45, phone: "07700 900005" },
    { name: "Demo Customer Six", address: "22 Reference Road", round: windowRound, service: "Patio Pressure Wash", price: 80, phone: "07700 900006" },
  ];

  // A rough, unnamed area of the generic UK bounding box — not tied to any
  // real named place, since the street/town names themselves are fictional.
  const baseLat = 52.9;
  const baseLng = -1.5;

  type CustomerRecord = { id: string };
  type PropertyRecord = { id: string; roundId: string | null };
  const created: Array<{ customer: CustomerRecord; property: PropertyRecord; serviceId: string; round: typeof windowRound }> = [];

  for (const [i, fixture] of customerFixtures.entries()) {
    const [firstName, ...rest] = fixture.name.split(" ");
    const customer = await prisma.customer.create({
      data: {
        organizationId,
        firstName,
        lastName: rest.join(" "),
        email: `demo.customer${i + 1}@demo.roundflow.invalid`,
        phone: fixture.phone,
        billingAddressLine1: fixture.address,
        billingCity: "Sampleford",
        billingPostcode: `SF${i + 1} 1DM`,
        preferredPaymentMethod: "CASH",
        notes: "Fictional Google Play reviewer demo customer — not a real person.",
      },
    });

    const property = await prisma.property.create({
      data: {
        customerId: customer.id,
        addressLine1: fixture.address,
        city: "Sampleford",
        postcode: `SF${i + 1} 1DM`,
        latitude: baseLat + i * 0.01,
        longitude: baseLng + i * 0.012,
        roundId: fixture.round.id,
        roundLocked: true,
        accessNotes: "Fictional demo property — RoundFlow Demo Property.",
      },
    });

    const service = await prisma.service.create({
      data: { propertyId: property.id, title: fixture.service, price: fixture.price, defaultIntervalWeeks: 4 },
    });

    created.push({ customer, property, serviceId: service.id, round: fixture.round });
  }

  const now = new Date();
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const workers = [worker1, worker2];

  // 8 upcoming (SCHEDULED) jobs, spread across all 6 demo properties.
  for (let i = 0; i < 8; i++) {
    const fixture = created[i % created.length];
    await prisma.job.create({
      data: {
        organizationId,
        roundId: fixture.round.id,
        propertyId: fixture.property.id,
        serviceId: fixture.serviceId,
        assignedWorkerId: workers[i % workers.length].id,
        status: "SCHEDULED",
        scheduledDate: daysFromNow(i + 1),
        priceCharged: customerFixtures[i % customerFixtures.length].price,
      },
    });
  }

  // 4 completed jobs, with placeholder before/after photos and fictional
  // financial records (transactions + notifications) attached.
  for (let i = 0; i < 4; i++) {
    const fixture = created[i % created.length];
    const worker = workers[i % workers.length];
    const job = await prisma.job.create({
      data: {
        organizationId,
        roundId: fixture.round.id,
        propertyId: fixture.property.id,
        serviceId: fixture.serviceId,
        assignedWorkerId: worker.id,
        completedByWorkerId: worker.id,
        status: "COMPLETED",
        scheduledDate: daysAgo(7 + i),
        startedAt: daysAgo(7 + i),
        completedAt: daysAgo(7 + i),
        priceCharged: customerFixtures[i % customerFixtures.length].price,
        beforePhotoUrl: PLACEHOLDER_PHOTO,
        afterPhotoUrl: PLACEHOLDER_PHOTO,
        workerNotes: "Fictional demo job note — completed as part of Google Play reviewer demo data.",
        isPaid: true,
        paymentStatus: "PAID",
      },
    });

    await prisma.transaction.create({
      data: {
        jobId: job.id,
        customerId: fixture.customer.id,
        amount: customerFixtures[i % customerFixtures.length].price,
        currency: "GBP",
        paymentGateway: "MANUAL_CASH", // never a real Stripe/GoCardless charge
        status: "PAID",
        invoiceNumber: `DEMO-INV-${String(i + 1).padStart(4, "0")}`,
      },
    });

    await prisma.notification.create({
      data: {
        customerId: fixture.customer.id,
        jobId: job.id,
        type: "JOB_COMPLETED",
        channel: "EMAIL",
        recipient: `demo.customer${(i % created.length) + 1}@demo.roundflow.invalid`,
        subject: "Your RoundFlow visit is complete",
        body: "Fictional demo notification — Google Play reviewer data, not a real message sent to a real customer.",
        status: "sent",
        sentAt: daysAgo(7 + i),
      },
    });
  }

  // 2 cancelled (SKIPPED) jobs.
  const skipReasons: Array<"WEATHER" | "CUSTOMER_HOLIDAY"> = ["WEATHER", "CUSTOMER_HOLIDAY"];
  for (let i = 0; i < 2; i++) {
    const fixture = created[i % created.length];
    await prisma.job.create({
      data: {
        organizationId,
        roundId: fixture.round.id,
        propertyId: fixture.property.id,
        serviceId: fixture.serviceId,
        assignedWorkerId: workers[i % workers.length].id,
        status: "SKIPPED",
        scheduledDate: daysAgo(2 + i),
        priceCharged: customerFixtures[i % customerFixtures.length].price,
        skipReason: skipReasons[i],
        skipNote: "Fictional demo skip note.",
      },
    });
  }

  // A pre-arrival notification not tied to a completed job, for variety.
  await prisma.notification.create({
    data: {
      customerId: created[0].customer.id,
      type: "PRE_ARRIVAL",
      channel: "SMS",
      recipient: customerFixtures[0].phone,
      body: "Fictional demo notification — your RoundFlow visit is scheduled for tomorrow.",
      status: "sent",
      sentAt: daysAgo(1),
    },
  });
}
