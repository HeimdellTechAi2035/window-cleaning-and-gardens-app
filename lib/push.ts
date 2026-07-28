import webpush from "web-push";
import { prisma } from "@/lib/prisma";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:contact@heimdell-tech-ai.co.uk",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

/**
 * Pushes a notification to every device a super-admin has enabled sign-up
 * alerts on. Best-effort by design — a missing VAPID config or a dead
 * subscription must never affect the registration flow that triggered this.
 */
export async function notifySuperAdmins(payload: { title: string; body: string; url?: string }) {
  if (!ensureConfigured()) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: { isPlatformSuperAdmin: true } },
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 404/410 means the browser has invalidated this subscription (e.g.
        // the app was uninstalled) — stop trying to send to it.
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("Push notification failed:", err);
        }
      }
    })
  );
}
