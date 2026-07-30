import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const results: Record<string, string> = {};

  for (const email of ["payment-flow-test@example.com"]) {
    try {
      const user = await prisma.user.findUnique({ where: { email }, select: { organizationId: true } });
      if (!user) {
        results[email] = "no user found";
        continue;
      }
      const deletedTransactions = await prisma.transaction.deleteMany({
        where: { customer: { organizationId: user.organizationId } },
      });
      const deletedNotifications = await prisma.notification.deleteMany({
        where: { customer: { organizationId: user.organizationId } },
      });
      await prisma.organization.delete({ where: { id: user.organizationId } });
      results[email] =
        `deleted ${deletedTransactions.count} transaction(s), ${deletedNotifications.count} notification(s), then org ${user.organizationId}`;
    } catch (e) {
      results[email] = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return NextResponse.json(results);
}
