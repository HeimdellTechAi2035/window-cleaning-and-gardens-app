"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCurrentUserSuperAdmin } from "@/lib/super-admin";

interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscriptionAction(
  subscription: SubscriptionInput
): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };
  if (!(await isCurrentUserSuperAdmin(session.user.id))) return { error: "Not authorized" };

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId: session.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: {
      userId: session.user.id,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });

  return { ok: true };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<{ ok: true }> {
  await prisma.pushSubscription.delete({ where: { endpoint } }).catch(() => {});
  return { ok: true };
}
