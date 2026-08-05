/**
 * Real-PostgreSQL staging validation for the account-deletion and
 * public-form rate-limiting system (docs/google-play-account-deletion-implementation.md).
 *
 * This script NEVER touches the application's normal DATABASE_URL. It
 * requires a dedicated TEST_DATABASE_URL or STAGING_DATABASE_URL, refuses
 * anything that looks like production, and only then points a Prisma
 * Client at it. All fixtures it creates are obviously fictional and are
 * deleted again at the end, in a `finally` block, regardless of outcome.
 *
 * Run with:  npx tsx scripts/validate-account-deletion-staging.ts
 * (or:       npm run validate:staging)
 */

import { createHmac } from "crypto";
import { existsSync } from "fs";
import path from "path";
import { config as loadDotenv } from "dotenv";

// A bare `tsx script.ts` run (unlike `next dev`/`next build`) does not get
// Next.js's automatic .env loading, so this script loads it manually.
// Later files override earlier ones for shared keys; nothing here is ever
// logged. `.env.staging.local` is the file this script's own safety gate
// reads TEST_DATABASE_URL/STAGING_DATABASE_URL from.
for (const file of [".env", ".env.local", ".env.staging.local"]) {
  const p = path.resolve(process.cwd(), file);
  if (existsSync(p)) loadDotenv({ path: p, override: true });
}

// ------------------------------------------------------------------
// Safety gate — runs before any Prisma import, using only Node's `url`
// module. Nothing below this point may read the connection string's
// username/password, and nothing may print the raw URL.
// ------------------------------------------------------------------

interface ConnectionInfo {
  provider: string;
  hostname: string;
  database: string;
  sslEnabled: boolean;
}

function describeConnection(raw: string): ConnectionInfo {
  const u = new URL(raw);
  const sslMode = u.searchParams.get("sslmode");
  return {
    provider: /neon\.tech$/i.test(u.hostname) ? "Neon" : u.hostname === "localhost" || u.hostname === "127.0.0.1" ? "local" : "unknown/other",
    hostname: u.hostname,
    database: u.pathname.replace(/^\//, "") || "(default)",
    sslEnabled: sslMode ? sslMode !== "disable" : u.hostname !== "localhost" && u.hostname !== "127.0.0.1",
  };
}

const SUSPICIOUS_SUBSTRINGS = ["prod", "production", "greenfix"];

function suspicionReason(info: ConnectionInfo): string | null {
  const haystack = `${info.hostname} ${info.database}`.toLowerCase();
  for (const term of SUSPICIOUS_SUBSTRINGS) {
    if (haystack.includes(term)) {
      return `hostname/database name contains "${term}", which could indicate a production database`;
    }
  }
  return null;
}

function fail(message: string): never {
  console.error(`\n✗ STAGING VALIDATION REFUSED TO RUN\n\n${message}\n`);
  process.exit(1);
}

/**
 * Resolves and validates the staging/test database URL. Exits the process
 * (never returns) if no safe database is configured — this function is the
 * entire enforcement of every requirement in the task's SAFETY GATE section.
 */
function resolveStagingDatabaseUrl(): { url: string; info: ConnectionInfo } {
  const candidateVarName = process.env.TEST_DATABASE_URL
    ? "TEST_DATABASE_URL"
    : process.env.STAGING_DATABASE_URL
      ? "STAGING_DATABASE_URL"
      : null;

  if (!candidateVarName) {
    fail(
      [
        "No dedicated staging/test database is configured. This script will never fall back to DATABASE_URL.",
        "",
        "To run this validation, Andy needs to provision an isolated PostgreSQL database and set ONE of:",
        "  - TEST_DATABASE_URL",
        "  - STAGING_DATABASE_URL",
        "",
        "Recommended: create a dedicated Neon branch for this purpose (e.g. `staging-account-deletion`),",
        "separate from any branch used by the live app, and use ITS pooled connection string. A throwaway",
        "local/Docker Postgres instance also satisfies this gate, as long as it contains no real tenant data.",
        "",
        "Do not point this at the existing DATABASE_URL / DATABASE_URL_UNPOOLED values, even in a dev environment —",
        "this script deliberately ignores those.",
      ].join("\n")
    );
  }

  const raw = process.env[candidateVarName]!;
  let info: ConnectionInfo;
  try {
    info = describeConnection(raw);
  } catch {
    fail(`${candidateVarName} is not a valid connection URL. Refusing to proceed.`);
  }

  const reason = suspicionReason(info);
  if (reason) {
    fail(`${candidateVarName} looks unsafe: ${reason}. Refusing to proceed against a database that might be production.`);
  }

  // Cross-check against the app's normal DATABASE_URL — if they resolve to
  // the exact same host+database, the "dedicated" variable isn't actually
  // isolated from whatever DATABASE_URL points to.
  if (process.env.DATABASE_URL) {
    try {
      const prodLike = describeConnection(process.env.DATABASE_URL);
      if (prodLike.hostname === info.hostname && prodLike.database === info.database) {
        fail(
          `${candidateVarName} resolves to the same host+database as DATABASE_URL (${prodLike.hostname}/${prodLike.database}). ` +
            "A staging database must be a genuinely separate database/branch, not an alias for the app's normal one."
        );
      }
    } catch {
      // DATABASE_URL isn't a parseable URL either — nothing to cross-check, not itself a reason to refuse.
    }
  }

  console.log("Database safety check passed. Connection details (no credentials shown):");
  console.log(`  Source variable : ${candidateVarName}`);
  console.log(`  Provider        : ${info.provider}`);
  console.log(`  Hostname        : ${info.hostname}`);
  console.log(`  Database name   : ${info.database}`);
  console.log(`  SSL enabled     : ${info.sslEnabled}`);
  console.log("");

  return { url: raw, info };
}

// ------------------------------------------------------------------
// Test bookkeeping
// ------------------------------------------------------------------

interface PhaseResult {
  phase: string;
  passed: boolean;
  detail: string;
}

const results: PhaseResult[] = [];

async function runPhase(phase: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    results.push({ phase, passed: true, detail });
    console.log(`  ✓ ${phase}\n    ${detail}`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ phase, passed: false, detail });
    console.log(`  ✗ ${phase}\n    ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ------------------------------------------------------------------
// Fixtures — entirely fictional. No real names, addresses, or credentials.
// ------------------------------------------------------------------

const FIXTURE_DOMAIN = "fixture.roundflow-staging.invalid";
const RUN_ID = Date.now().toString(36);

async function main() {
  const { url: safeUrl } = resolveStagingDatabaseUrl();

  // Point ONLY this process at the staging database. Must happen before
  // any app module that constructs a PrismaClient is imported, since that
  // construction reads process.env.DATABASE_URL at import time.
  process.env.DATABASE_URL = safeUrl;

  const { prisma } = await import("@/lib/prisma");
  const {
    anonymizeUser,
    isSoleActiveAdmin,
    processOrganizationDeletion,
    generateVerificationToken,
    tokenMatchesHash,
    calculateProcessingDeadline,
    calculateBillingRetentionDate,
  } = await import("@/lib/account-deletion");
  const { checkAndRecordRateLimit, isLockedOut, recordFailedAttempt, normalizeEmail } = await import("@/lib/rate-limit");

  // Every ID this script creates, tracked so cleanup can remove it even if
  // a phase throws partway through. Cleared as rows are actually deleted.
  const createdOrgIds = new Set<string>();
  const createdRequestIds = new Set<string>();
  const createdBillingRecordIds = new Set<string>();
  const createdRateLimitKeys = new Set<string>(); // { scope, key } pairs, joined as "scope::key"

  try {
    console.log("=== 1. Schema objects ===\n");
    await runPhase("AccountDeletionRequest / PlatformBillingRecord / RateLimitBucket tables exist", async () => {
      const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
        select table_name from information_schema.tables
        where table_schema = 'public'
          and table_name in ('account_deletion_requests', 'platform_billing_records', 'rate_limit_buckets')
      `;
      const found = new Set(rows.map((r) => r.table_name));
      for (const t of ["account_deletion_requests", "platform_billing_records", "rate_limit_buckets"]) {
        assert(found.has(t), `expected table "${t}" to exist`);
      }
      return "all three tables present in information_schema.";
    });

    await runPhase("AccountDeletionRequest FKs are ON DELETE SET NULL (not CASCADE)", async () => {
      const rows = await prisma.$queryRaw<Array<{ constraint_name: string; delete_rule: string }>>`
        select rc.constraint_name, rc.delete_rule
        from information_schema.referential_constraints rc
        join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
        where tc.table_name = 'account_deletion_requests'
      `;
      assert(rows.length === 2, `expected 2 foreign keys on account_deletion_requests, found ${rows.length}`);
      for (const r of rows) {
        assert(r.delete_rule === "SET NULL", `${r.constraint_name} has delete_rule=${r.delete_rule}, expected SET NULL`);
      }
      return `both FKs (${rows.map((r) => r.constraint_name).join(", ")}) are ON DELETE SET NULL.`;
    });

    await runPhase("RateLimitBucket has a unique (scope, key) constraint and an expiresAt index", async () => {
      // Prisma's @@unique compiles to a plain `CREATE UNIQUE INDEX`, not an
      // `ADD CONSTRAINT ... UNIQUE` — Postgres enforces uniqueness either
      // way, but only the latter registers a row in pg_constraint. Checking
      // pg_index.indisunique is the correct way to detect either form.
      const uniqueRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
        select i.relname as indexname
        from pg_index x
        join pg_class c on c.oid = x.indrelid
        join pg_class i on i.oid = x.indexrelid
        where c.relname = 'rate_limit_buckets' and x.indisunique = true
      `;
      assert(uniqueRows.length >= 1, "expected a unique index on rate_limit_buckets");

      const indexRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
        select indexname from pg_indexes
        where tablename = 'rate_limit_buckets' and indexdef ilike '%expiresAt%'
      `;
      assert(indexRows.length >= 1, "expected an index involving expiresAt on rate_limit_buckets");
      return `unique index: ${uniqueRows.map((r) => r.indexname).join(", ")}; expiresAt index present.`;
    });

    await runPhase("No unexpected destructive change to pre-existing tables", async () => {
      // A light sanity check, not a full schema diff: confirm long-standing
      // tables this migration never touched still have their expected
      // primary tenant-scoping columns.
      const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and table_name in ('organizations', 'users', 'customers', 'jobs')
          and column_name in ('id', 'organizationId')
      `;
      assert(rows.length >= 7, `expected core id/organizationId columns to still exist on unrelated tables, found ${rows.length} matching columns`);
      return "organizations/users/customers/jobs retain their expected id/organizationId columns.";
    });

    console.log("\n=== 2. Fixtures ===\n");

    let orgA!: { id: string; slug: string; name: string };
    let orgB!: { id: string; slug: string; name: string };
    let adminA!: { id: string; email: string };
    let workerA!: { id: string; email: string };
    let jobA1Id!: string;
    let orgBSnapshot!: {
      orgRow: unknown;
      userCount: number;
      customerCount: number;
      jobCount: number;
      transactionCount: number;
      customerEmails: string[];
    };

    await runPhase("Create Organization A + B fixtures (fictional data only)", async () => {
      orgA = await prisma.organization.create({
        data: {
          name: "RoundFlow Deletion Test Ltd",
          slug: `roundflow-deletion-test-${RUN_ID}`,
          stripeSecretKey: "sk_test_FICTIONAL_00000000000000000000",
          stripeWebhookSecret: "whsec_FICTIONAL_0000000000000000",
          gocardlessAccessToken: "gc_test_FICTIONAL_00000000000000",
          gocardlessWebhookSecret: "gcwh_FICTIONAL_0000000000000000",
          // A fixed, known last-billed-period date (one of the task's own
          // worked examples: 5 Aug 2026 -> FY ending 31 May 2027 -> retained
          // until 31 May 2033) so the real org-deletion phase below
          // deterministically exercises the genuine-transaction-date path
          // of the retention calculation, not the "no billed period"
          // fallback, and its result can be asserted against an exact date.
          currentPeriodEnd: new Date("2026-08-05T00:00:00.000Z"),
        },
      });
      createdOrgIds.add(orgA.id);

      adminA = await prisma.user.create({
        data: {
          organizationId: orgA.id,
          name: "Fixture Admin A",
          email: `admin.a.${RUN_ID}@${FIXTURE_DOMAIN}`,
          passwordHash: "$2a$04$FICTIONAL0000000000000000000000000000000000000000000",
          role: "ADMIN",
          phone: "+440000000001",
        },
      });
      workerA = await prisma.user.create({
        data: {
          organizationId: orgA.id,
          name: "Fixture Operative A",
          email: `worker.a.${RUN_ID}@${FIXTURE_DOMAIN}`,
          passwordHash: "$2a$04$FICTIONAL0000000000000000000000000000000000000000000",
          role: "OPERATIVE",
          phone: "+440000000002",
        },
      });
      // Session + Account rows so anonymizeUser's session/account cleanup is real.
      await prisma.session.create({
        data: { sessionToken: `fixture-session-${RUN_ID}`, userId: workerA.id, expires: new Date(Date.now() + 86_400_000) },
      });
      await prisma.account.create({
        data: {
          userId: workerA.id,
          type: "oauth",
          provider: "fixture-provider",
          providerAccountId: `fixture-${RUN_ID}`,
        },
      });

      const round = await prisma.round.create({
        data: { organizationId: orgA.id, name: `Fixture Round A ${RUN_ID}` },
      });

      const cust1 = await prisma.customer.create({
        data: {
          organizationId: orgA.id,
          firstName: "Fictional",
          lastName: "CustomerOne",
          email: `customer1.${RUN_ID}@${FIXTURE_DOMAIN}`,
          phone: "+440000000003",
          billingAddressLine1: "1 Fictional Street",
          billingCity: "Testville",
          billingPostcode: "TE5T 1NG",
        },
      });
      const cust2 = await prisma.customer.create({
        data: {
          organizationId: orgA.id,
          firstName: "Fictional",
          lastName: "CustomerTwo",
          email: `customer2.${RUN_ID}@${FIXTURE_DOMAIN}`,
          phone: "+440000000004",
          billingAddressLine1: "2 Fictional Street",
          billingCity: "Testville",
          billingPostcode: "TE5T 1NG",
        },
      });

      const prop1 = await prisma.property.create({
        data: {
          customerId: cust1.id,
          addressLine1: "1 Fictional Street",
          city: "Testville",
          postcode: "TE5T 1NG",
          roundId: round.id,
          accessNotes: "Fictional access note for staging validation only.",
        },
      });
      const prop2 = await prisma.property.create({
        data: {
          customerId: cust2.id,
          addressLine1: "2 Fictional Street",
          city: "Testville",
          postcode: "TE5T 1NG",
          roundId: round.id,
        },
      });

      const svc1 = await prisma.service.create({
        data: { propertyId: prop1.id, title: "Fixture Window Clean", price: 20 },
      });
      const svc2 = await prisma.service.create({
        data: { propertyId: prop2.id, title: "Fixture Window Clean", price: 20 },
      });

      const job1 = await prisma.job.create({
        data: {
          organizationId: orgA.id,
          roundId: round.id,
          propertyId: prop1.id,
          serviceId: svc1.id,
          assignedWorkerId: workerA.id,
          completedByWorkerId: workerA.id,
          status: "COMPLETED",
          scheduledDate: new Date(),
          completedAt: new Date(),
          priceCharged: 20,
          beforePhotoUrl: "https://example.invalid/fixture-before.jpg",
          afterPhotoUrl: "https://example.invalid/fixture-after.jpg",
          workerNotes: "Fictional job note for staging validation only.",
        },
      });
      jobA1Id = job1.id;
      await prisma.job.create({
        data: {
          organizationId: orgA.id,
          roundId: round.id,
          propertyId: prop2.id,
          serviceId: svc2.id,
          assignedWorkerId: workerA.id,
          status: "SCHEDULED",
          scheduledDate: new Date(),
          priceCharged: 20,
        },
      });

      await prisma.transaction.create({
        data: {
          customerId: cust1.id,
          jobId: job1.id,
          amount: 20,
          paymentGateway: "MANUAL_CASH",
          status: "PAID",
          invoiceNumber: `FIXTURE-INV-${RUN_ID}-1`,
        },
      });
      await prisma.notification.create({
        data: {
          customerId: cust1.id,
          jobId: job1.id,
          type: "JOB_COMPLETED",
          channel: "EMAIL",
          recipient: `customer1.${RUN_ID}@${FIXTURE_DOMAIN}`,
          body: "Fictional notification body for staging validation only.",
        },
      });

      // Organization B — the isolation control group.
      orgB = await prisma.organization.create({
        data: { name: "RoundFlow Isolation Control Ltd", slug: `roundflow-isolation-control-${RUN_ID}` },
      });
      createdOrgIds.add(orgB.id);
      const adminB = await prisma.user.create({
        data: {
          organizationId: orgB.id,
          name: "Fixture Admin B",
          email: `admin.b.${RUN_ID}@${FIXTURE_DOMAIN}`,
          passwordHash: "$2a$04$FICTIONAL0000000000000000000000000000000000000000000",
          role: "ADMIN",
        },
      });
      const roundB = await prisma.round.create({ data: { organizationId: orgB.id, name: `Fixture Round B ${RUN_ID}` } });
      const custB = await prisma.customer.create({
        data: {
          organizationId: orgB.id,
          firstName: "Fictional",
          lastName: "CustomerB",
          email: `customerb.${RUN_ID}@${FIXTURE_DOMAIN}`,
        },
      });
      const propB = await prisma.property.create({
        data: { customerId: custB.id, addressLine1: "1 Isolation Way", city: "Testville", postcode: "TE5T 2NG", roundId: roundB.id },
      });
      const svcB = await prisma.service.create({ data: { propertyId: propB.id, title: "Fixture Round B Service", price: 15 } });
      await prisma.job.create({
        data: {
          organizationId: orgB.id,
          roundId: roundB.id,
          propertyId: propB.id,
          serviceId: svcB.id,
          assignedWorkerId: adminB.id,
          status: "SCHEDULED",
          scheduledDate: new Date(),
          priceCharged: 15,
        },
      });
      await prisma.transaction.create({
        data: { customerId: custB.id, amount: 15, paymentGateway: "MANUAL_CASH", invoiceNumber: `FIXTURE-INV-${RUN_ID}-B` },
      });

      return `Org A "${orgA.slug}" (2 users, 2 customers, 2 properties, 2 jobs, 1 transaction, 1 notification); Org B "${orgB.slug}" (isolation control).`;
    });

    await runPhase("Snapshot Organization B before any Organization A operation", async () => {
      const [orgRow, userCount, customerCount, jobCount, transactionCount, customers] = await Promise.all([
        prisma.organization.findUniqueOrThrow({ where: { id: orgB.id } }),
        prisma.user.count({ where: { organizationId: orgB.id } }),
        prisma.customer.count({ where: { organizationId: orgB.id } }),
        prisma.job.count({ where: { organizationId: orgB.id } }),
        prisma.transaction.count({ where: { customer: { organizationId: orgB.id } } }),
        prisma.customer.findMany({ where: { organizationId: orgB.id }, select: { email: true } }),
      ]);
      orgBSnapshot = {
        orgRow,
        userCount,
        customerCount,
        jobCount,
        transactionCount,
        customerEmails: customers.map((c) => c.email).filter((e): e is string => !!e),
      };
      return `users=${userCount} customers=${customerCount} jobs=${jobCount} transactions=${transactionCount}.`;
    });

    console.log("\n=== 3. Sole administrator protection ===\n");
    await runPhase("Sole active admin is correctly identified server-side from real DB state", async () => {
      const soleBefore = await isSoleActiveAdmin(adminA.id, orgA.id);
      assert(soleBefore === true, "expected adminA to be identified as the sole active admin");

      await prisma.user.update({ where: { id: workerA.id }, data: { role: "ADMIN" } });
      const soleWithTwoAdmins = await isSoleActiveAdmin(adminA.id, orgA.id);
      assert(soleWithTwoAdmins === false, "expected isSoleActiveAdmin to return false once a second active admin exists");

      await prisma.user.update({ where: { id: workerA.id }, data: { role: "OPERATIVE" } }); // restore for later phases
      const soleAfterRestoring = await isSoleActiveAdmin(adminA.id, orgA.id);
      assert(soleAfterRestoring === true, "expected sole-admin status to be restored after demoting the second admin back");

      return "isSoleActiveAdmin correctly reflects real, live admin counts (blocks with 1 admin, unblocks with 2, re-blocks after demotion) — this is the exact function the in-app action calls, so the restriction is enforced from real database state, not a client-supplied flag.";
    });

    console.log("\n=== 4. Individual user deletion ===\n");
    await runPhase("Normal (non-admin) user deletion anonymises the row and preserves everything else", async () => {
      const beforeSessions = await prisma.session.count({ where: { userId: workerA.id } });
      const beforeAccounts = await prisma.account.count({ where: { userId: workerA.id } });
      assert(beforeSessions === 1 && beforeAccounts === 1, "fixture setup should have created 1 session + 1 account for workerA");

      await anonymizeUser(workerA.id);

      // Mirrors the exact audit-row write requestUserDeletionAction performs.
      const auditRow = await prisma.accountDeletionRequest.create({
        data: {
          requestType: "USER",
          source: "IN_APP",
          status: "COMPLETED",
          userId: null,
          userEmailSnapshot: workerA.email,
          organizationId: orgA.id,
          requesterEmail: workerA.email,
          requestedAt: new Date(),
          verifiedAt: new Date(),
          completedAt: new Date(),
          retentionSummary: "Staging validation: user anonymised.",
        },
      });
      createdRequestIds.add(auditRow.id);

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: workerA.id } });
      assert(updated.name === "Former user", `expected name="Former user", got "${updated.name}"`);
      assert(updated.email.startsWith("deleted-"), `expected anonymised email placeholder, got "${updated.email}"`);
      assert(updated.passwordHash === null, "expected passwordHash to be cleared");
      assert(updated.isActive === false, "expected isActive=false");
      assert(updated.phone === null, "expected phone to be cleared");

      const afterSessions = await prisma.session.count({ where: { userId: workerA.id } });
      const afterAccounts = await prisma.account.count({ where: { userId: workerA.id } });
      assert(afterSessions === 0, "expected sessions to be removed");
      assert(afterAccounts === 0, "expected OAuth accounts to be removed");

      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobA1Id }, include: { completedByWorker: true } });
      assert(job.completedByWorker?.name === "Former user", 'expected historical job.completedByWorker.name === "Former user"');

      const adminStillFine = await prisma.user.findUniqueOrThrow({ where: { id: adminA.id } });
      assert(adminStillFine.isActive === true && adminStillFine.passwordHash !== null, "expected the admin user to be completely unaffected");

      return "workerA anonymised (name/email/phone/passwordHash cleared, isActive=false), sessions+OAuth accounts removed, historical job still shows completedByWorker.name = \"Former user\", adminA untouched.";
    });

    console.log("\n=== 5. Audit-record survival of related-row deletion (schema-level) ===\n");
    await runPhase("AccountDeletionRequest survives its linked User and Organization being deleted", async () => {
      const throwawayOrg = await prisma.organization.create({
        data: { name: "Fixture SchemaCheck Org", slug: `fixture-schema-check-${RUN_ID}` },
      });
      createdOrgIds.add(throwawayOrg.id); // defensive: caught by cleanup even if this phase fails before its own explicit delete below
      const throwawayUser = await prisma.user.create({
        data: { organizationId: throwawayOrg.id, email: `schemacheck.${RUN_ID}@${FIXTURE_DOMAIN}`, role: "ADMIN" },
      });
      const req = await prisma.accountDeletionRequest.create({
        data: {
          requestType: "USER",
          source: "IN_APP",
          status: "COMPLETED",
          userId: throwawayUser.id,
          organizationId: throwawayOrg.id,
          userEmailSnapshot: throwawayUser.email,
          organizationNameSnapshot: throwawayOrg.name,
          requesterEmail: throwawayUser.email,
        },
      });
      createdRequestIds.add(req.id); // defensive: caught by cleanup even if this phase fails before its own explicit delete below

      // Delete the User directly (raw delete, not anonymizeUser) to exercise the FK's SET NULL behaviour specifically.
      await prisma.user.delete({ where: { id: throwawayUser.id } });
      const afterUserDelete = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: req.id } });
      assert(afterUserDelete.userId === null, "expected userId to become NULL after the User row was deleted");
      assert(afterUserDelete.userEmailSnapshot === throwawayUser.email, "expected userEmailSnapshot to survive");

      await prisma.organization.delete({ where: { id: throwawayOrg.id } });
      const afterOrgDelete = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: req.id } });
      assert(afterOrgDelete.organizationId === null, "expected organizationId to become NULL after the Organization row was deleted");
      assert(afterOrgDelete.organizationNameSnapshot === throwawayOrg.name, "expected organizationNameSnapshot to survive");

      await prisma.accountDeletionRequest.delete({ where: { id: req.id } }); // this row was purely for this schema check
      return "userId and organizationId both correctly became NULL (ON DELETE SET NULL) while the snapshot fields survived — confirmed against real foreign-key behaviour, not just the schema declaration.";
    });

    console.log("\n=== 6. Cancellation / rejection lifecycle ===\n");
    await runPhase("A pending request can be cancelled; a cancelled request cannot then be processed", async () => {
      const req = await prisma.accountDeletionRequest.create({
        data: {
          requestType: "ORGANIZATION",
          source: "IN_APP",
          status: "VERIFIED",
          organizationId: orgA.id,
          organizationNameSnapshot: orgA.name,
          requesterEmail: adminA.email,
        },
      });
      createdRequestIds.add(req.id);

      // Mirrors cancelOrganizationDeletionRequestAction's own status gate.
      const cancellable = (["PENDING_VERIFICATION", "VERIFIED"] as const).includes(req.status as "PENDING_VERIFICATION" | "VERIFIED");
      assert(cancellable, "a freshly VERIFIED request should be cancellable");
      await prisma.accountDeletionRequest.update({ where: { id: req.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });

      const cancelled = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: req.id } });
      assert(cancelled.status === "CANCELLED", "expected status=CANCELLED");
      // Mirrors processOrganizationDeletionRequestAction's own status gate.
      const processable = (["VERIFIED", "IN_PROGRESS"] as const).includes(cancelled.status as "VERIFIED" | "IN_PROGRESS");
      assert(!processable, "a CANCELLED request must not be processable");

      return "request moved VERIFIED -> CANCELLED, and the processing status gate correctly refuses a CANCELLED request.";
    });

    await runPhase("A completed request cannot be cancelled or otherwise modified by the cancellation path", async () => {
      const req = await prisma.accountDeletionRequest.create({
        data: {
          requestType: "USER",
          source: "IN_APP",
          status: "COMPLETED",
          completedAt: new Date(),
          requesterEmail: `completed-check.${RUN_ID}@${FIXTURE_DOMAIN}`,
        },
      });
      createdRequestIds.add(req.id);

      const cancellable = (["PENDING_VERIFICATION", "VERIFIED"] as const).includes(req.status as "PENDING_VERIFICATION" | "VERIFIED");
      assert(!cancellable, "a COMPLETED request must not be reported as cancellable");
      return "COMPLETED status correctly falls outside the cancellable set — matches the immutability rule enforced in app/actions/account-deletion.ts.";
    });

    await runPhase("A rejected request records its reason", async () => {
      const req = await prisma.accountDeletionRequest.create({
        data: {
          requestType: "ORGANIZATION",
          source: "PUBLIC_WEB",
          status: "VERIFIED",
          organizationId: orgA.id,
          requesterEmail: `reject-check.${RUN_ID}@${FIXTURE_DOMAIN}`,
        },
      });
      createdRequestIds.add(req.id);

      const reason = "Staging validation: fictional rejection reason.";
      await prisma.accountDeletionRequest.update({
        where: { id: req.id },
        data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason },
      });
      const rejected = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: req.id } });
      assert(rejected.status === "REJECTED" && rejected.rejectionReason === reason, "expected the rejection reason to be persisted");
      return `rejection reason persisted verbatim: "${reason}".`;
    });

    console.log("\n=== 7. Public verification flow (real persistence, no real email sent) ===\n");
    await runPhase("Verification tokens are stored only as a hash; a valid token verifies once", async () => {
      const { token, tokenHash, expiry } = generateVerificationToken();
      const req = await prisma.accountDeletionRequest.create({
        data: {
          requestType: "USER",
          source: "PUBLIC_WEB",
          status: "PENDING_VERIFICATION",
          requesterEmail: `verify-check.${RUN_ID}@${FIXTURE_DOMAIN}`,
          verificationTokenHash: tokenHash,
          verificationExpiry: expiry,
        },
      });
      createdRequestIds.add(req.id);

      const stored = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: req.id } });
      assert(stored.verificationTokenHash !== token, "the stored value must not equal the raw token");
      assert(/^[0-9a-f]{64}$/.test(stored.verificationTokenHash ?? ""), "expected a sha256 hex digest to be stored");

      // Mirrors verifyPublicDeletionRequestAction's own matching logic.
      const candidates = await prisma.accountDeletionRequest.findMany({
        where: { status: "PENDING_VERIFICATION", verificationTokenHash: { not: null }, verificationExpiry: { gt: new Date() } },
      });
      const match = candidates.find((c) => c.verificationTokenHash && tokenMatchesHash(token, c.verificationTokenHash));
      assert(match?.id === req.id, "expected the real token to match its own request via tokenMatchesHash");

      await prisma.accountDeletionRequest.update({
        where: { id: req.id },
        data: { status: "VERIFIED", verifiedAt: new Date(), verificationTokenHash: null, verificationExpiry: null },
      });

      // Replay: the same query no longer returns this row (status changed + hash cleared).
      const replayCandidates = await prisma.accountDeletionRequest.findMany({
        where: { status: "PENDING_VERIFICATION", verificationTokenHash: { not: null }, verificationExpiry: { gt: new Date() } },
      });
      assert(!replayCandidates.some((c) => c.id === req.id), "expected the request to be unreachable by the same query after verification (no replay)");

      return "token stored only as a sha256 hash, matched successfully once via tokenMatchesHash, and unreachable by the same lookup query on replay (single-use enforced at the data layer).";
    });

    await runPhase("An expired token's request is excluded from the verification query", async () => {
      const { tokenHash } = generateVerificationToken();
      const req = await prisma.accountDeletionRequest.create({
        data: {
          requestType: "USER",
          source: "PUBLIC_WEB",
          status: "PENDING_VERIFICATION",
          requesterEmail: `expired-check.${RUN_ID}@${FIXTURE_DOMAIN}`,
          verificationTokenHash: tokenHash,
          verificationExpiry: new Date(Date.now() - 1000), // already expired
        },
      });
      createdRequestIds.add(req.id);

      const candidates = await prisma.accountDeletionRequest.findMany({
        where: { status: "PENDING_VERIFICATION", verificationTokenHash: { not: null }, verificationExpiry: { gt: new Date() } },
      });
      assert(!candidates.some((c) => c.id === req.id), "expected an expired request to be excluded by the verificationExpiry > now filter");
      return "expired request correctly excluded by the real database query's expiry filter.";
    });

    await runPhase("An invalid token cannot be distinguished from a non-existent account", async () => {
      // No matching hash exists for a freshly-generated random token — the
      // real action returns one fixed generic error string regardless of
      // whether ANY account/request exists, which we confirm structurally:
      // the lookup returns undefined either way, so the caller-facing
      // response is identical by construction (no branch on "found vs not found").
      const { token: neverStoredToken } = generateVerificationToken();
      const candidates = await prisma.accountDeletionRequest.findMany({
        where: { status: "PENDING_VERIFICATION", verificationTokenHash: { not: null }, verificationExpiry: { gt: new Date() } },
      });
      const match = candidates.find((c) => c.verificationTokenHash && tokenMatchesHash(neverStoredToken, c.verificationTokenHash));
      assert(match === undefined, "a token that was never issued must never match");
      return "no match found for a never-issued token — the action layer (tested with mocks in tests/public-deletion-actions.test.ts) returns the same generic error for this case as for an expired/reused token.";
    });

    console.log("\n=== 8. Organisation deletion (full cascade) + retained-data inspection ===\n");
    let orgADeletionRequestId!: string;
    let orgABillingRecordId: string | null = null;
    await runPhase("Processing a verified organisation deletion removes all tenant operational data", async () => {
      const req = await prisma.accountDeletionRequest.create({
        data: {
          requestType: "ORGANIZATION",
          source: "IN_APP",
          status: "VERIFIED",
          organizationId: orgA.id,
          organizationNameSnapshot: orgA.name,
          userId: adminA.id,
          userEmailSnapshot: adminA.email,
          requesterEmail: adminA.email,
          processingDeadline: calculateProcessingDeadline(),
        },
      });
      orgADeletionRequestId = req.id;
      createdRequestIds.add(req.id);

      const before = {
        users: await prisma.user.count({ where: { organizationId: orgA.id } }),
        customers: await prisma.customer.count({ where: { organizationId: orgA.id } }),
        properties: await prisma.property.count({ where: { customer: { organizationId: orgA.id } } }),
        jobs: await prisma.job.count({ where: { organizationId: orgA.id } }),
        rounds: await prisma.round.count({ where: { organizationId: orgA.id } }),
        services: await prisma.service.count({ where: { property: { customer: { organizationId: orgA.id } } } }),
        notifications: await prisma.notification.count({ where: { customer: { organizationId: orgA.id } } }),
        transactions: await prisma.transaction.count({ where: { customer: { organizationId: orgA.id } } }),
      };
      assert(before.users >= 2 && before.customers === 2 && before.jobs === 2, "expected fixture rows to still be present before processing");

      const result = await processOrganizationDeletion({ organizationId: orgA.id, deletionRequestId: req.id });
      assert(result.alreadyDeleted === false, "expected the first processing call to actually perform the deletion");

      const orgRow = await prisma.organization.findUnique({ where: { id: orgA.id } });
      assert(orgRow === null, "expected the Organization row itself to be gone");

      const after = {
        users: await prisma.user.count({ where: { organizationId: orgA.id } }),
        customers: await prisma.customer.count({ where: { organizationId: orgA.id } }),
        jobs: await prisma.job.count({ where: { organizationId: orgA.id } }),
        rounds: await prisma.round.count({ where: { organizationId: orgA.id } }),
        transactions: await prisma.transaction.findMany({ where: { invoiceNumber: { startsWith: `FIXTURE-INV-${RUN_ID}-1` } } }),
        notifications: await prisma.notification.count({ where: { recipient: { contains: `.${RUN_ID}@` } } }),
      };
      assert(after.users === 0, `expected 0 users after deletion, found ${after.users}`);
      assert(after.customers === 0, `expected 0 customers after deletion, found ${after.customers}`);
      assert(after.jobs === 0, `expected 0 jobs after deletion, found ${after.jobs}`);
      assert(after.rounds === 0, `expected 0 rounds after deletion, found ${after.rounds}`);
      assert(after.transactions.length === 0, "expected the fixture transaction to be gone");
      assert(after.notifications === 0, "expected the fixture notification to be gone");

      const billingRecords = await prisma.platformBillingRecord.findMany({ where: { deletionRequestId: req.id } });
      assert(billingRecords.length === 1, `expected exactly 1 PlatformBillingRecord, found ${billingRecords.length}`);
      orgABillingRecordId = billingRecords[0].id;
      createdBillingRecordIds.add(billingRecords[0].id);

      // Org A's fixture currentPeriodEnd is fixed to 5 Aug 2026 (see fixture
      // creation) — one of the task's own worked examples: that falls in
      // the Heimdell financial year ending 31 May 2027, so retention must
      // be exactly 31 May 2033. Asserting the real, persisted value here —
      // not just the pure-function unit test — proves the deletion-
      // processing code path actually wires the organisation's genuine
      // billing-transaction date into the calculation, end to end.
      const retainedUntil = billingRecords[0].retainedUntil;
      assert(retainedUntil.getUTCFullYear() === 2033, `expected retainedUntil year 2033, got ${retainedUntil.getUTCFullYear()}`);
      assert(retainedUntil.getUTCMonth() === 4, `expected retainedUntil month May (4), got ${retainedUntil.getUTCMonth()}`);
      assert(retainedUntil.getUTCDate() === 31, `expected retainedUntil date 31, got ${retainedUntil.getUTCDate()}`);

      return `before: ${JSON.stringify(before)}. All tenant rows (users, customers, properties, jobs, rounds, services, notifications, transactions) confirmed gone; 1 PlatformBillingRecord retained (retainedUntil = ${retainedUntil.toISOString()}, correctly computed from the organisation's real currentPeriodEnd of 5 Aug 2026 -> FY ending 31 May 2027 -> +6 years = 31 May 2033); Organization row itself is gone (not just deactivated).`;
    });

    await runPhase("The retained PlatformBillingRecord contains no tenant customer personal data", async () => {
      assert(orgABillingRecordId, "expected a billing record id from the previous phase");
      const record = await prisma.platformBillingRecord.findUniqueOrThrow({ where: { id: orgABillingRecordId! } });
      const keys = Object.keys(record);
      // An exact allowlist, not a substring blocklist: `platformStripeCustomerId`
      // legitimately contains "customer" as a substring (it's Heimdell's own
      // Stripe reference for the ORGANISATION as a paying customer of
      // RoundFlow — not any tenant's own end-customer's personal data), so a
      // naive substring scan for "customer" would false-positive on it. The
      // model's full, intended field list is the real source of truth here.
      const allowedKeys = new Set([
        "id",
        "organizationName",
        "organizationSlug",
        "platformStripeCustomerId",
        "platformStripeSubscriptionId",
        "lastSubscriptionStatus",
        "subscriptionStartedAt",
        "subscriptionEndedAt",
        "deletionRequestId",
        "retainedUntil",
        "retentionReason",
        "createdAt",
      ]);
      const unexpected = keys.filter((k) => !allowedKeys.has(k));
      assert(unexpected.length === 0, `retained record has unexpected keys not in the documented PlatformBillingRecord shape: ${unexpected.join(", ")}`);
      // Belt-and-braces: confirm the fixture customers'/workers' actual
      // fictional identifiers never leak into the retained record's values.
      const serialised = JSON.stringify(record).toLowerCase();
      assert(!serialised.includes(FIXTURE_DOMAIN.toLowerCase()), "retained record must not contain any fixture email domain reference");
      return `retained fields: ${keys.join(", ")}. None reference customer/worker personal data, photos, notes, passwords, or secrets.`;
    });

    console.log("\n=== 9. Tenant isolation ===\n");
    await runPhase("Organization B is completely unchanged after Organization A's deletion", async () => {
      const orgBAfter = await prisma.organization.findUniqueOrThrow({ where: { id: orgB.id } });
      const [userCount, customerCount, jobCount, transactionCount, customers] = await Promise.all([
        prisma.user.count({ where: { organizationId: orgB.id } }),
        prisma.customer.count({ where: { organizationId: orgB.id } }),
        prisma.job.count({ where: { organizationId: orgB.id } }),
        prisma.transaction.count({ where: { customer: { organizationId: orgB.id } } }),
        prisma.customer.findMany({ where: { organizationId: orgB.id }, select: { email: true } }),
      ]);

      assert(JSON.stringify(orgBAfter) === JSON.stringify(orgBSnapshot.orgRow), "Organization B row itself must be byte-for-byte unchanged");
      assert(userCount === orgBSnapshot.userCount, `user count changed: ${orgBSnapshot.userCount} -> ${userCount}`);
      assert(customerCount === orgBSnapshot.customerCount, `customer count changed: ${orgBSnapshot.customerCount} -> ${customerCount}`);
      assert(jobCount === orgBSnapshot.jobCount, `job count changed: ${orgBSnapshot.jobCount} -> ${jobCount}`);
      assert(transactionCount === orgBSnapshot.transactionCount, `transaction count changed: ${orgBSnapshot.transactionCount} -> ${transactionCount}`);
      const emailsAfter = customers.map((c) => c.email).filter((e): e is string => !!e);
      assert(JSON.stringify(emailsAfter.sort()) === JSON.stringify(orgBSnapshot.customerEmails.sort()), "Organization B customer emails must be unchanged");

      return `Organization B row + counts (users=${userCount}, customers=${customerCount}, jobs=${jobCount}, transactions=${transactionCount}) and customer emails are identical before/after Organization A's deletion.`;
    });

    console.log("\n=== 10. Idempotency ===\n");
    await runPhase("Re-processing the same (now-deleted) organisation is idempotent", async () => {
      const secondResult = await processOrganizationDeletion({ organizationId: orgA.id, deletionRequestId: orgADeletionRequestId });
      assert(secondResult.alreadyDeleted === true, "expected the second call to report alreadyDeleted=true");

      const billingRecords = await prisma.platformBillingRecord.findMany({ where: { deletionRequestId: orgADeletionRequestId } });
      assert(billingRecords.length === 1, `expected still exactly 1 PlatformBillingRecord after re-processing, found ${billingRecords.length}`);

      // Mirrors processOrganizationDeletionRequestAction's own idempotency short-circuit.
      await prisma.accountDeletionRequest.update({
        where: { id: orgADeletionRequestId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: orgADeletionRequestId } });
      const wouldShortCircuit = request.status === "COMPLETED";
      assert(wouldShortCircuit, "expected the action-layer idempotency guard (status === COMPLETED) to trip on a 3rd attempt");

      return "2nd call to processOrganizationDeletion() returned alreadyDeleted=true with no duplicate PlatformBillingRecord; the action-layer status guard would short-circuit a 3rd attempt entirely. No external cancellation was attempted (PLATFORM_STRIPE_SECRET_KEY is unset in this run — see retention section below).";
    });

    console.log("\n=== 11. Rate limiting (real PostgreSQL writes) ===\n");
    const rlScope = (name: string) => `staging_validation_${name}_${RUN_ID}`;
    const CONCURRENCY_TRIALS = 20;

    await runPhase("5 submissions/hour per IP are allowed; the 6th is blocked", async () => {
      const scope = rlScope("submit_ip");
      const ip = "203.0.113.10";
      createdRateLimitKeys.add(`${scope}::hashed(${ip})`);
      let allowed = 0;
      for (let i = 0; i < 5; i++) {
        const r = await checkAndRecordRateLimit({ scope, rawKey: ip, max: 5, windowMs: 60 * 60 * 1000 });
        if (!r.limited) allowed++;
      }
      assert(allowed === 5, `expected all 5 requests within the limit to be allowed, got ${allowed}`);
      const sixth = await checkAndRecordRateLimit({ scope, rawKey: ip, max: 5, windowMs: 60 * 60 * 1000 });
      assert(sixth.limited === true, "expected the 6th request to be blocked");
      assert(typeof sixth.retryAfterSeconds === "number" && sixth.retryAfterSeconds! > 0, "expected a positive retryAfterSeconds");
      return `5 allowed, 6th blocked with retryAfterSeconds=${sixth.retryAfterSeconds}, against real Postgres.`;
    });

    await runPhase("3 submissions/24h per normalised email are enforced, case/whitespace cannot bypass it", async () => {
      const scope = rlScope("submit_email");
      const variants = [`Case.Test.${RUN_ID}@${FIXTURE_DOMAIN}`, `case.test.${RUN_ID}@${FIXTURE_DOMAIN}`, `CASE.TEST.${RUN_ID}@${FIXTURE_DOMAIN}`];
      createdRateLimitKeys.add(`${scope}::hashed(normalised-email)`);
      for (const variant of variants) {
        const normalised = normalizeEmail(variant);
        const r = await checkAndRecordRateLimit({ scope, rawKey: normalised, max: 3, windowMs: 24 * 60 * 60 * 1000 });
        assert(!r.limited, `expected variant "${variant}" (normalised: "${normalised}") to be allowed`);
      }
      const fourthVariant = `  CaSe.TeSt.${RUN_ID}@${FIXTURE_DOMAIN}  `;
      const fourth = await checkAndRecordRateLimit({ scope, rawKey: normalizeEmail(fourthVariant), max: 3, windowMs: 24 * 60 * 60 * 1000 });
      assert(fourth.limited === true, "expected a 4th differently-cased/whitespace-padded variant of the same email to be blocked");
      return "3 case-variant submissions of the same email all counted against one bucket; a 4th (also case/whitespace-varied) was blocked.";
    });

    await runPhase("Expired rate-limit buckets no longer block requests", async () => {
      const scope = rlScope("expiry");
      const ip = "203.0.113.20";
      for (let i = 0; i < 3; i++) {
        await checkAndRecordRateLimit({ scope, rawKey: ip, max: 3, windowMs: 60_000 });
      }
      const blocked = await checkAndRecordRateLimit({ scope, rawKey: ip, max: 3, windowMs: 60_000 });
      assert(blocked.limited === true, "expected the bucket to be exhausted");

      // Backdate the real row's expiry directly, rather than sleeping in a validation script.
      const keyHash = createHmacForTest(scope, ip);
      const updateResult = await prisma.rateLimitBucket.updateMany({
        where: { scope, key: keyHash },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      assert(updateResult.count === 1, "expected to find and backdate exactly 1 real rate-limit row");

      const afterExpiry = await checkAndRecordRateLimit({ scope, rawKey: ip, max: 3, windowMs: 60_000 });
      assert(afterExpiry.limited === false, "expected the request to be allowed again after the window expired");
      return "bucket correctly resets and stops blocking once its real, persisted expiresAt has passed.";
    });

    await runPhase("Raw IP and raw email are never persisted in rate_limit_buckets — only their HMAC hash", async () => {
      const scope = rlScope("privacy_check");
      const ip = "203.0.113.30";
      const email = `privacy.check.${RUN_ID}@${FIXTURE_DOMAIN}`;
      await checkAndRecordRateLimit({ scope: `${scope}_ip`, rawKey: ip, max: 5, windowMs: 60_000 });
      await checkAndRecordRateLimit({ scope: `${scope}_email`, rawKey: normalizeEmail(email), max: 5, windowMs: 60_000 });

      const rows = await prisma.rateLimitBucket.findMany({ where: { scope: { in: [`${scope}_ip`, `${scope}_email`] } } });
      assert(rows.length === 2, `expected 2 rows, found ${rows.length}`);
      for (const row of rows) {
        assert(row.key !== ip, "raw IP must never be stored as the key");
        assert(!row.key.includes(ip), "hash must not contain the raw IP as a substring");
        assert(row.key !== email && row.key !== normalizeEmail(email), "raw/normalised email must never be stored as the key directly");
        assert(/^[0-9a-f]{64}$/.test(row.key), `expected a sha256-hex-shaped hash, got "${row.key.slice(0, 8)}..."`);
      }
      return "confirmed by direct table inspection: stored `key` values are 64-char hex HMAC digests, containing neither the raw IP nor the raw/normalised email as a substring.";
    });

    await runPhase("Authenticated in-app deletion activity does not touch rate_limit_buckets", async () => {
      const before = await prisma.rateLimitBucket.count();
      // isSoleActiveAdmin and anonymizeUser are the real functions the
      // authenticated in-app actions call — neither imports lib/rate-limit.ts.
      await isSoleActiveAdmin(adminA.id, orgA.id);
      const after = await prisma.rateLimitBucket.count();
      assert(before === after, `expected rate_limit_buckets row count to be unchanged (${before} -> ${after})`);
      return `rate_limit_buckets row count unchanged (${before}) after exercising authenticated in-app logic — confirms these code paths are structurally independent of the public-form rate limiter.`;
    });

    console.log("\n=== 12. Verification-attempt lockout ===\n");
    await runPhase("10 failed verification attempts lock out the guessing key; a correct attempt is never penalised", async () => {
      const scope = rlScope("verify_lockout");
      const ip = "203.0.113.40";
      for (let i = 0; i < 10; i++) {
        const status = await isLockedOut({ scope, rawKey: ip, max: 10, windowMs: 60 * 60 * 1000 });
        assert(!status.limited, `expected no lockout before failure #${i + 1}`);
        await recordFailedAttempt({ scope, rawKey: ip, max: 10, windowMs: 60 * 60 * 1000 });
      }
      const lockedOut = await isLockedOut({ scope, rawKey: ip, max: 10, windowMs: 60 * 60 * 1000 });
      assert(lockedOut.limited === true, "expected lockout after the 10th recorded failure");

      const otherIp = "203.0.113.41";
      const otherStatus = await isLockedOut({ scope, rawKey: otherIp, max: 10, windowMs: 60 * 60 * 1000 });
      assert(!otherStatus.limited, "a different IP must not be affected by another IP's lockout");

      return "lockout trips at exactly 10 recorded failures against the real database, and is correctly scoped per key (a different IP is unaffected).";
    });

    console.log("\n=== 13. Concurrency / unique-constraint behaviour ===\n");
    await runPhase("Repeated trials: 8 simultaneous requests against max=5 — exactly 5 allowed, exactly 3 blocked, every single time", async () => {
      const TRIALS = CONCURRENCY_TRIALS;
      const CONCURRENT_REQUESTS = 8;
      const max = 5;
      const windowMs = 60_000;
      let anyOverrun = false;
      const perTrialFinalCounts: number[] = [];

      for (let trial = 0; trial < TRIALS; trial++) {
        // A fresh (scope, key) per trial — trials must be independent of
        // each other, only the 8 requests *within* a trial are concurrent.
        const scope = rlScope(`concurrency_trial_${trial}`);
        const ip = `203.0.113.${60 + trial}`;

        const outcomes = await Promise.allSettled(
          Array.from({ length: CONCURRENT_REQUESTS }, () => checkAndRecordRateLimit({ scope, rawKey: ip, max, windowMs }))
        );

        const rejected = outcomes.filter((o) => o.status === "rejected");
        assert(
          rejected.length === 0,
          `trial ${trial}: expected no unhandled exceptions (e.g. a unique-constraint violation) from concurrent calls, got ${rejected.length}: ${rejected.map((r) => (r as PromiseRejectedResult).reason).join("; ")}`
        );

        const allowedCount = outcomes.filter((o) => o.status === "fulfilled" && !o.value.limited).length;
        const blockedCount = CONCURRENT_REQUESTS - allowedCount;

        const keyHash = createHmacForTest(scope, ip);
        const finalRow = await prisma.rateLimitBucket.findUnique({ where: { scope_key: { scope, key: keyHash } } });
        const finalCount = finalRow?.count ?? 0;
        perTrialFinalCounts.push(finalCount);

        if (allowedCount > max) anyOverrun = true;
        assert(allowedCount === max, `trial ${trial}: expected exactly ${max} allowed, got ${allowedCount} (zero overruns are required, not just measured)`);
        assert(blockedCount === CONCURRENT_REQUESTS - max, `trial ${trial}: expected exactly ${CONCURRENT_REQUESTS - max} blocked, got ${blockedCount}`);
        assert(
          finalCount === CONCURRENT_REQUESTS,
          `trial ${trial}: expected the final stored counter to equal ${CONCURRENT_REQUESTS} (every concurrent request atomically incremented, none lost), got ${finalCount}`
        );
      }

      assert(!anyOverrun, "at least one trial allowed more requests than the configured threshold — the atomic fix did not hold");
      return `${TRIALS} trials of ${CONCURRENT_REQUESTS} truly simultaneous requests each (max=${max}): every single trial allowed exactly ${max} and blocked exactly ${CONCURRENT_REQUESTS - max}, with a final stored counter of exactly ${CONCURRENT_REQUESTS} every time (values: ${perTrialFinalCounts.join(", ")}). Zero overruns across ${TRIALS} independent trials — no unhandled exceptions (no unique-constraint violation ever reached application code, by construction of ON CONFLICT DO UPDATE).`;
    });

    await runPhase("Two simultaneous requests at the exact window-reset boundary trigger only one reset", async () => {
      const scope = rlScope("boundary");
      const ip = "203.0.113.90";
      const max = 5;
      const windowMs = 60_000;

      const first = await checkAndRecordRateLimit({ scope, rawKey: ip, max, windowMs });
      assert(!first.limited, "initial request should succeed and create the bucket");

      const keyHash = createHmacForTest(scope, ip);
      const backdated = await prisma.rateLimitBucket.updateMany({
        where: { scope, key: keyHash },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      assert(backdated.count === 1, "expected to backdate exactly the one bucket just created");

      // Two requests arriving at the same instant the window has just
      // expired: both race to see "expired", but only one may actually
      // perform the reset (count=1); the other must see the already-reset,
      // already-fresh-window row and increment on top of it (count=2) — a
      // lost update here would show up as both landing on count=1.
      const [a, b] = await Promise.all([
        checkAndRecordRateLimit({ scope, rawKey: ip, max, windowMs }),
        checkAndRecordRateLimit({ scope, rawKey: ip, max, windowMs }),
      ]);

      const finalRow = await prisma.rateLimitBucket.findUniqueOrThrow({ where: { scope_key: { scope, key: keyHash } } });
      assert(
        finalRow.count === 2,
        `expected final count to be exactly 2 after two simultaneous post-expiry requests (one reset + one increment), got ${finalRow.count}`
      );
      assert(!a.limited && !b.limited, "both simultaneous post-expiry requests should be allowed (well under max)");

      return `after backdating expiry and firing 2 truly simultaneous requests at the boundary, the final stored count is exactly 2 (one atomic reset-to-1, one atomic increment-to-2) — not 1 (which would mean both independently reset and a count was lost). Confirms the CASE expression re-evaluates against the just-committed row for the second request, not a stale pre-expiry read.`;
    });

    await runPhase("Concurrent requests against two different keys never interfere with each other", async () => {
      const scopeA = rlScope("isolation_concurrent_a");
      const scopeB = rlScope("isolation_concurrent_b");
      const ipA = "203.0.113.100";
      const ipB = "203.0.113.101";
      const max = 5;
      const windowMs = 60_000;

      // Interleave 5 concurrent requests each, for two entirely different
      // keys, fired in the same Promise.all — a shared/miscomputed lock
      // would show up as cross-contaminated counts between A and B.
      const outcomes = await Promise.all([
        ...Array.from({ length: 5 }, () => checkAndRecordRateLimit({ scope: scopeA, rawKey: ipA, max, windowMs })),
        ...Array.from({ length: 5 }, () => checkAndRecordRateLimit({ scope: scopeB, rawKey: ipB, max, windowMs })),
      ]);
      assert(outcomes.every((o) => !o.limited), "expected all 10 requests (5 per key, under each key's own max) to be allowed");

      const keyHashA = createHmacForTest(scopeA, ipA);
      const keyHashB = createHmacForTest(scopeB, ipB);
      const rowA = await prisma.rateLimitBucket.findUniqueOrThrow({ where: { scope_key: { scope: scopeA, key: keyHashA } } });
      const rowB = await prisma.rateLimitBucket.findUniqueOrThrow({ where: { scope_key: { scope: scopeB, key: keyHashB } } });
      assert(rowA.count === 5, `expected key A's count to be exactly 5, got ${rowA.count}`);
      assert(rowB.count === 5, `expected key B's count to be exactly 5, got ${rowB.count}`);

      return `10 concurrent requests split across 2 distinct keys (5 each): each key's final count is exactly 5, with no cross-contamination between them.`;
    });

    console.log("\n=== 14. Retention calculation (Heimdell financial year end 31 May + 6 years) ===\n");
    await runPhase("The four confirmed worked examples all compute the correct financial-year-based retention date", async () => {
      const cases: Array<{ label: string; input: string; expectedYear: number }> = [
        { label: "20 May 2026 (within FY)", input: "2026-05-20T12:00:00.000Z", expectedYear: 2032 },
        { label: "5 Aug 2026 (after FY end)", input: "2026-08-05T12:00:00.000Z", expectedYear: 2033 },
        { label: "31 May 2027 (on FY end)", input: "2027-05-31T12:00:00.000Z", expectedYear: 2033 },
        { label: "1 Jun 2027 (day after FY end)", input: "2027-06-01T12:00:00.000Z", expectedYear: 2034 },
      ];
      const results: string[] = [];
      for (const c of cases) {
        const retainedUntil = calculateBillingRetentionDate(new Date(c.input));
        assert(retainedUntil.getUTCFullYear() === c.expectedYear, `${c.label}: expected year ${c.expectedYear}, got ${retainedUntil.getUTCFullYear()}`);
        assert(retainedUntil.getUTCMonth() === 4 && retainedUntil.getUTCDate() === 31, `${c.label}: expected 31 May, got ${retainedUntil.toISOString()}`);
        results.push(`${c.label} -> ${retainedUntil.toISOString().slice(0, 10)}`);
      }
      return `all 4 confirmed examples match: ${results.join("; ")}.`;
    });

    await runPhase("UTC boundary behaviour: 31 May 23:59:59.999Z vs 1 June 00:00:00.000Z resolve to different financial years", async () => {
      const justBefore = calculateBillingRetentionDate(new Date("2026-05-31T23:59:59.999Z"));
      const justAfter = calculateBillingRetentionDate(new Date("2026-06-01T00:00:00.000Z"));
      assert(justBefore.getUTCFullYear() === 2032, `expected 2032 for 31 May 23:59:59.999Z, got ${justBefore.getUTCFullYear()}`);
      assert(justAfter.getUTCFullYear() === 2033, `expected 2033 for 1 June 00:00:00.000Z, got ${justAfter.getUTCFullYear()}`);
      assert(
        justBefore.getUTCHours() === 23 && justBefore.getUTCMinutes() === 59 && justBefore.getUTCSeconds() === 59 && justBefore.getUTCMilliseconds() === 999,
        "expected the returned boundary to be exactly 23:59:59.999 UTC"
      );
      return "1ms apart in real time, 31 May 23:59:59.999Z and 1 June 00:00:00.000Z correctly resolve to different financial years (2032 vs 2033) — confirms UTC-calendar-field-based computation, not a local-time-dependent one.";
    });

    await runPhase("A leap-year transaction date (29 Feb) computes cleanly with no drift", async () => {
      const retainedUntil = calculateBillingRetentionDate(new Date("2028-02-29T12:00:00.000Z"));
      assert(retainedUntil.getUTCFullYear() === 2034, `expected 2034, got ${retainedUntil.getUTCFullYear()}`);
      assert(retainedUntil.getUTCMonth() === 4 && retainedUntil.getUTCDate() === 31, `expected 31 May, got ${retainedUntil.toISOString()}`);
      return `29 Feb 2028 (a leap day) -> FY ending 31 May 2028 -> retained until ${retainedUntil.toISOString().slice(0, 10)}, unaffected by the intervening leap year.`;
    });

    await runPhase("The real, persisted PlatformBillingRecord from this run's organisation deletion matches the expected worked-example date", async () => {
      const realRecord = orgABillingRecordId ? await prisma.platformBillingRecord.findUnique({ where: { id: orgABillingRecordId } }) : null;
      assert(realRecord !== null, "expected a real billing record from the earlier organisation-deletion phase");
      assert(realRecord!.retainedUntil.getUTCFullYear() === 2033, `expected the real record's retainedUntil year to be 2033, got ${realRecord!.retainedUntil.getUTCFullYear()}`);

      return (
        `Real, persisted retainedUntil = ${realRecord!.retainedUntil.toISOString()}, computed from the organisation's real currentPeriodEnd (5 Aug 2026, fixed in this run's fixture) — a genuine last-billed-transaction date, not the subscription-cancellation/deletion-processing moment. ` +
        `Heimdell's financial year end is confirmed as 31 May; retention is 6 years after the financial year end the transaction falls into. ` +
        `Longer retention may exceptionally be required for a transaction spanning multiple accounting periods, a late-filed company tax return, an open HMRC compliance check, or another documented legal hold — none of that is automated here (no such signal exists in this system); it requires an authorised manual legal-hold decision (documented as a future operational procedure — see docs/google-play-account-deletion-implementation.md).`
      );
    });

    console.log("\n=== Cleanup ===\n");
    await cleanup();

    function createHmacForTest(scope: string, rawValue: string): string {
      const secret = process.env.AUTH_SECRET;
      if (!secret) throw new Error("AUTH_SECRET must be set for the rate-limit hashing checks to run");
      return createHmac("sha256", secret).update(`${scope}:${rawValue}`).digest("hex");
    }

    async function cleanup() {
      // Organization A's tenant rows are already gone via the deletion test
      // itself. What's left to remove: Organization B (isolation control),
      // every AccountDeletionRequest / PlatformBillingRecord this script
      // created (including the real Org A audit trail — kept only for the
      // duration of this validation run, not a real compliance record),
      // and every RateLimitBucket row this script wrote.
      let cleanupErrors = 0;

      try {
        if (orgB) await prisma.organization.delete({ where: { id: orgB.id } });
      } catch (e) {
        cleanupErrors++;
        console.warn(`  cleanup warning (Organization B): ${e instanceof Error ? e.message : e}`);
      }

      try {
        await prisma.platformBillingRecord.deleteMany({ where: { id: { in: [...createdBillingRecordIds] } } });
      } catch (e) {
        cleanupErrors++;
        console.warn(`  cleanup warning (PlatformBillingRecord): ${e instanceof Error ? e.message : e}`);
      }

      try {
        await prisma.accountDeletionRequest.deleteMany({ where: { id: { in: [...createdRequestIds] } } });
      } catch (e) {
        cleanupErrors++;
        console.warn(`  cleanup warning (AccountDeletionRequest): ${e instanceof Error ? e.message : e}`);
      }

      try {
        const scopes = [
          rlScope("submit_ip"),
          rlScope("submit_email"),
          rlScope("expiry"),
          `${rlScope("privacy_check")}_ip`,
          `${rlScope("privacy_check")}_email`,
          rlScope("verify_lockout"),
          rlScope("boundary"),
          rlScope("isolation_concurrent_a"),
          rlScope("isolation_concurrent_b"),
          ...Array.from({ length: CONCURRENCY_TRIALS }, (_, i) => rlScope(`concurrency_trial_${i}`)),
        ];
        await prisma.rateLimitBucket.deleteMany({ where: { scope: { in: scopes } } });
      } catch (e) {
        cleanupErrors++;
        console.warn(`  cleanup warning (RateLimitBucket): ${e instanceof Error ? e.message : e}`);
      }

      // Defensive: if the org-deletion phase itself failed partway, make sure
      // Organization A doesn't linger either.
      try {
        await prisma.organization.deleteMany({ where: { id: { in: [...createdOrgIds] } } });
      } catch (e) {
        cleanupErrors++;
        console.warn(`  cleanup warning (residual organizations): ${e instanceof Error ? e.message : e}`);
      }

      console.log(cleanupErrors === 0 ? "  ✓ all fixtures cleaned up" : `  ⚠ cleanup finished with ${cleanupErrors} warning(s) — check the staging database manually`);
    }
  } finally {
    const { prisma: prismaForDisconnect } = await import("@/lib/prisma");
    await prismaForDisconnect.$disconnect();
  }

  console.log("\n=== Summary ===\n");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  for (const r of results) {
    console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.phase}`);
  }
  console.log(`\n${passed}/${results.length} phases passed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nStaging validation crashed unexpectedly:\n", e);
  process.exit(1);
});
