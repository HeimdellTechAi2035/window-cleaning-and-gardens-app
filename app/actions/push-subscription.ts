"use server";

import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscriptionAction(
  subscription: SubscriptionInput
): Promise<{ ok: true } | { error: string }> {
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized" };

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      platformAdminId: session.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: {
      platformAdminId: session.id,
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
