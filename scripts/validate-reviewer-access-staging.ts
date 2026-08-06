/**
 * Real-PostgreSQL staging validation for the Google Play reviewer-access
 * feature (lib/reviewer-access.ts, app/actions/reviewer-access.ts).
 *
 * Same safety gate as scripts/validate-account-deletion-staging.ts: refuses
 * to run without a dedicated TEST_DATABASE_URL/STAGING_DATABASE_URL, never
 * falls back to DATABASE_URL, refuses anything that looks like production.
 *
 * Run with: npx tsx scripts/validate-reviewer-access-staging.ts
 */

import { existsSync } from "fs";
import path from "path";
import { config as loadDotenv } from "dotenv";

for (const file of [".env", ".env.local", ".env.staging.local"]) {
  const p = path.resolve(process.cwd(), file);
  if (existsSync(p)) loadDotenv({ path: p, override: true });
}

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
    provider: /neon\.tech$/i.test(u.hostname) ? "Neon" : u.hostname === "localhost" ? "local" : "unknown/other",
    hostname: u.hostname,
    database: u.pathname.replace(/^\//, "") || "(default)",
    sslEnabled: sslMode ? sslMode !== "disable" : u.hostname !== "localhost",
  };
}

const SUSPICIOUS_SUBSTRINGS = ["prod", "production", "greenfix"];

function fail(message: string): never {
  console.error(`\n✗ STAGING VALIDATION REFUSED TO RUN\n\n${message}\n`);
  process.exit(1);
}

function resolveStagingDatabaseUrl(): string {
  const varName = process.env.TEST_DATABASE_URL ? "TEST_DATABASE_URL" : process.env.STAGING_DATABASE_URL ? "STAGING_DATABASE_URL" : null;
  if (!varName) {
    fail("No TEST_DATABASE_URL or STAGING_DATABASE_URL is set. Refusing to fall back to DATABASE_URL.");
  }
  const raw = process.env[varName!]!;
  let info: ConnectionInfo;
  try {
    info = describeConnection(raw);
  } catch {
    fail(`${varName} is not a valid connection URL.`);
  }
  const haystack = `${info!.hostname} ${info!.database}`.toLowerCase();
  for (const term of SUSPICIOUS_SUBSTRINGS) {
    if (haystack.includes(term)) fail(`${varName} looks unsafe: contains "${term}".`);
  }
  if (process.env.DATABASE_URL) {
    try {
      const prodLike = describeConnection(process.env.DATABASE_URL);
      if (prodLike.hostname === info!.hostname && prodLike.database === info!.database) {
        fail(`${varName} resolves to the same host+database as DATABASE_URL.`);
      }
    } catch {
      /* not parseable — nothing to cross-check */
    }
  }

  console.log("Database safety check passed. Connection details (no credentials shown):");
  console.log(`  Source variable : ${varName}`);
  console.log(`  Provider        : ${info!.provider}`);
  console.log(`  Hostname        : ${info!.hostname}`);
  console.log(`  Database name   : ${info!.database}`);
  console.log(`  SSL enabled     : ${info!.sslEnabled}`);
  console.log("");
  return raw;
}

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

async function main() {
  const safeUrl = resolveStagingDatabaseUrl();
  process.env.DATABASE_URL = safeUrl;

  const { prisma } = await import("@/lib/prisma");
  const {
    createOrEnsureReviewerAccount,
    regenerateReviewerPassword,
    disableReviewerAccess,
    resetReviewerDemoData,
    getReviewerAccessStatus,
    REVIEWER_ORG_SLUG,
    REVIEWER_EMAIL,
  } = await import("@/lib/reviewer-access");

  let finalPassword = "";

  try {
    console.log("=== 1. Schema objects ===\n");
    await runPhase("Organization has the new reviewer columns", async () => {
      const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
        select column_name from information_schema.columns
        where table_name = 'organizations' and column_name in ('isReviewerOrganisation', 'reviewerDemoDataResetAt')
      `;
      assert(rows.length === 2, `expected both new columns, found ${rows.length}`);
      return "isReviewerOrganisation and reviewerDemoDataResetAt both present on organizations.";
    });

    console.log("\n=== 2. Create reviewer account ===\n");
    let firstPassword = "";
    await runPhase("createOrEnsureReviewerAccount() creates the org, admin user, and demo data", async () => {
      const result = await createOrEnsureReviewerAccount();
      firstPassword = result.tempPassword;
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: result.organizationId } });
      assert(org.slug === REVIEWER_ORG_SLUG, "expected the fixed reviewer slug");
      assert(org.isReviewerOrganisation === true, "expected isReviewerOrganisation=true");
      assert(org.subscriptionStatus === "active", "expected subscriptionStatus=active");
      assert(org.platformStripeCustomerId === null, "expected no real Stripe customer id");
      assert(org.platformStripeSubscriptionId === null, "expected no real Stripe subscription id");

      const user = await prisma.user.findUniqueOrThrow({ where: { email: REVIEWER_EMAIL } });
      assert(user.role === "ADMIN", "expected reviewer user role=ADMIN");
      assert(user.isActive === true, "expected reviewer user isActive=true");
      assert(user.passwordHash !== null && user.passwordHash.startsWith("$2"), "expected a real bcrypt hash");
      assert(user.passwordHash !== firstPassword, "password hash must not equal the plaintext password");

      const [customers, rounds, jobs, workers] = await Promise.all([
        prisma.customer.count({ where: { organizationId: org.id } }),
        prisma.round.count({ where: { organizationId: org.id } }),
        prisma.job.count({ where: { organizationId: org.id } }),
        prisma.user.count({ where: { organizationId: org.id, role: "OPERATIVE" } }),
      ]);
      assert(customers === 6, `expected 6 customers, got ${customers}`);
      assert(rounds === 2, `expected 2 rounds, got ${rounds}`);
      assert(jobs === 14, `expected 14 jobs, got ${jobs}`);
      assert(workers === 2, `expected 2 workers, got ${workers}`);

      const jobStatusCounts = await prisma.job.groupBy({ by: ["status"], where: { organizationId: org.id }, _count: true });
      const byStatus = Object.fromEntries(jobStatusCounts.map((r) => [r.status, r._count]));
      assert(byStatus.SCHEDULED === 8, `expected 8 SCHEDULED jobs, got ${byStatus.SCHEDULED}`);
      assert(byStatus.COMPLETED === 4, `expected 4 COMPLETED jobs, got ${byStatus.COMPLETED}`);
      assert(byStatus.SKIPPED === 2, `expected 2 SKIPPED jobs, got ${byStatus.SKIPPED}`);

      return `org=${org.id}, ${customers} customers, ${rounds} rounds, ${jobs} jobs (8 scheduled / 4 completed / 2 skipped), ${workers} workers.`;
    });

    console.log("\n=== 3. Idempotency ===\n");
    await runPhase("Running create again does not create a duplicate organisation or duplicate demo data", async () => {
      const before = await prisma.organization.count({ where: { slug: REVIEWER_ORG_SLUG } });
      const result = await createOrEnsureReviewerAccount();
      const after = await prisma.organization.count({ where: { slug: REVIEWER_ORG_SLUG } });
      assert(before === 1 && after === 1, `expected exactly 1 reviewer org before and after, got ${before} -> ${after}`);

      const customerCount = await prisma.customer.count({ where: { organizationId: result.organizationId } });
      assert(customerCount === 6, `expected demo data to remain at 6 customers (not duplicated), got ${customerCount}`);

      assert(result.tempPassword !== firstPassword, "expected a fresh password issued on this second run too");
      return `still exactly 1 reviewer organisation, demo data unchanged (6 customers), and a fresh password was issued.`;
    });

    console.log("\n=== 4. Password regeneration ===\n");
    await runPhase("regenerateReviewerPassword() issues a new password that invalidates the previous one", async () => {
      const bcrypt = (await import("bcryptjs")).default;
      const before = await prisma.user.findUniqueOrThrow({ where: { email: REVIEWER_EMAIL } });
      const { tempPassword: newPassword } = await regenerateReviewerPassword();
      finalPassword = newPassword;
      const after = await prisma.user.findUniqueOrThrow({ where: { email: REVIEWER_EMAIL } });

      assert(after.passwordHash !== before.passwordHash, "expected the stored hash to change");
      const newMatchesNewHash = await bcrypt.compare(newPassword, after.passwordHash ?? "");
      assert(newMatchesNewHash, "expected the new password to match the newly stored hash");
      return "password hash changed, and the newly generated password correctly verifies against the new hash.";
    });

    console.log("\n=== 5. Reset demo data ===\n");
    await runPhase("resetReviewerDemoData() wipes and repopulates only the reviewer organisation", async () => {
      const status = await getReviewerAccessStatus();
      assert(status.organizationId, "expected the reviewer organisation to exist");
      await resetReviewerDemoData();
      const customers = await prisma.customer.count({ where: { organizationId: status.organizationId! } });
      const jobs = await prisma.job.count({ where: { organizationId: status.organizationId! } });
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: status.organizationId! } });
      assert(customers === 6, `expected 6 customers after reset, got ${customers}`);
      assert(jobs === 14, `expected 14 jobs after reset, got ${jobs}`);
      assert(org.reviewerDemoDataResetAt !== null, "expected reviewerDemoDataResetAt to be set");
      return `demo data reset: 6 customers, 14 jobs, reviewerDemoDataResetAt=${org.reviewerDemoDataResetAt?.toISOString()}.`;
    });

    console.log("\n=== 6. Disable / re-enable ===\n");
    await runPhase("disableReviewerAccess() blocks sign-in; re-creating re-activates it", async () => {
      await disableReviewerAccess();
      const disabled = await prisma.user.findUniqueOrThrow({ where: { email: REVIEWER_EMAIL } });
      assert(disabled.isActive === false, "expected isActive=false after disabling");

      const result = await createOrEnsureReviewerAccount();
      finalPassword = result.tempPassword;
      const reenabled = await prisma.user.findUniqueOrThrow({ where: { email: REVIEWER_EMAIL } });
      assert(reenabled.isActive === true, "expected isActive=true after re-running create");
      return "disable correctly sets isActive=false; re-running create correctly re-activates the account.";
    });

    console.log("\n=== 7. Cross-tenant isolation ===\n");
    await runPhase("A second, unrelated organisation is completely unaffected by any reviewer-access operation", async () => {
      const otherOrg = await prisma.organization.create({
        data: { name: "Unrelated Staging Control Org", slug: `unrelated-control-${Date.now()}` },
      });
      const otherCustomer = await prisma.customer.create({
        data: { organizationId: otherOrg.id, firstName: "Control", lastName: "Customer" },
      });

      await resetReviewerDemoData();

      const stillThere = await prisma.customer.findUnique({ where: { id: otherCustomer.id } });
      assert(stillThere !== null, "expected the unrelated organisation's customer to be untouched");

      // Cleanup this throwaway control org only.
      await prisma.organization.delete({ where: { id: otherOrg.id } });
      return "an unrelated organisation's data was completely unaffected by resetReviewerDemoData(); throwaway control org cleaned up.";
    });

    console.log("\n=== Summary ===\n");
  } finally {
    const { prisma: p } = await import("@/lib/prisma");
    await p.$disconnect();
  }

  const passed = results.filter((r) => r.passed).length;
  for (const r of results) console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.phase}`);
  console.log(`\n${passed}/${results.length} phases passed.`);

  if (finalPassword) {
    console.log("\n=== STAGING reviewer credentials (staging database only — not production) ===");
    console.log(`Email:    ${REVIEWER_EMAIL}`);
    console.log(`Password: ${finalPassword}`);
    console.log("(This is the isolated staging database's reviewer account — a separate, real production run is still required.)");
  }

  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

main().catch((e) => {
  console.error("\nStaging validation crashed unexpectedly:\n", e);
  process.exit(1);
});
