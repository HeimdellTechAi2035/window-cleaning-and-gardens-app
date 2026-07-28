import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stripe redirects here right after Checkout completes, before the webhook
 * that actually flips subscriptionStatus to "trialing"/"active" is
 * guaranteed to have landed. Polling briefly here avoids bouncing a brand
 * new subscriber straight back to the paywall due to that race.
 */
export default async function BillingSuccessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  for (let attempt = 0; attempt < 6; attempt++) {
    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { subscriptionStatus: true },
    });
    if (organization && ["trialing", "active"].includes(organization.subscriptionStatus)) {
      redirect("/dashboard");
    }
    await sleep(1000);
  }

  redirect("/dashboard");
}
