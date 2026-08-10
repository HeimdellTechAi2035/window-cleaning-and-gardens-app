"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bulkPostcodesIoLookup } from "@/lib/route-optimizer";

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  if (session.user.role !== "ADMIN") throw new Error("Admin access required");
  return session;
}

export async function updateOrganizationProfileAction(formData: FormData) {
  const session = await requireAdminSession();

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: {
      name: String(formData.get("name") ?? ""),
      timezone: String(formData.get("timezone") ?? "Europe/London"),
    },
  });

  revalidatePath("/settings");
}

export async function updateIntegrationSettingsAction(formData: FormData) {
  const session = await requireAdminSession();

  const gocardlessAccessToken = formData.get("gocardlessAccessToken");
  const gocardlessEnv = formData.get("gocardlessEnv");
  const gocardlessWebhookSecret = formData.get("gocardlessWebhookSecret");
  const stripeSecretKey = formData.get("stripeSecretKey");
  const stripeWebhookSecret = formData.get("stripeWebhookSecret");
  const resendFromEmail = formData.get("resendFromEmail");

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: {
      ...(gocardlessAccessToken ? { gocardlessAccessToken: String(gocardlessAccessToken) } : {}),
      ...(gocardlessEnv ? { gocardlessEnv: String(gocardlessEnv) } : {}),
      ...(gocardlessWebhookSecret ? { gocardlessWebhookSecret: String(gocardlessWebhookSecret) } : {}),
      ...(stripeSecretKey ? { stripeSecretKey: String(stripeSecretKey) } : {}),
      ...(stripeWebhookSecret ? { stripeWebhookSecret: String(stripeWebhookSecret) } : {}),
      ...(resendFromEmail ? { resendFromEmail: String(resendFromEmail) } : {}),
    },
  });

  revalidatePath("/settings");
}

export async function backfillPropertyCoordinatesAction(): Promise<{
  geocoded: number;
  failed: number;
  skippedLocked: number;
}> {
  const session = await requireAdminSession();

  // Re-checks every property, not just ones with no coordinates at all — a
  // property can already have coordinates that are simply wrong (e.g. a
  // past geocoding bug placed it in the wrong town/region entirely), which
  // "only fill in the blanks" would silently skip forever. The one
  // exception is a property whose pin was manually corrected and locked
  // (see updatePropertyPinAction) — that's never touched again here.
  const [properties, skippedLocked] = await Promise.all([
    prisma.property.findMany({
      where: {
        customer: { organizationId: session.user.organizationId },
        coordinatesLocked: false,
      },
      select: { id: true, postcode: true },
    }),
    prisma.property.count({
      where: {
        customer: { organizationId: session.user.organizationId },
        coordinatesLocked: true,
      },
    }),
  ]);

  // Deliberately uses the fast bulk postcode lookup here, not the slower
  // per-property Nominatim street-level search: a naive one-request-per-
  // property loop (even with no delay) risks exceeding a serverless
  // function's execution time limit once an organisation has more than a
  // handful of properties — this previously caused the whole action to
  // silently time out partway through for larger customer bases. This
  // trades pinpoint street-level accuracy for postcode-district accuracy
  // (always correctly in the right area) and a bulk operation that
  // actually completes. Editing and re-saving one address individually, or
  // manually dragging its pin, still gets full street-level precision.
  const coordsByPostcode = await bulkPostcodesIoLookup(properties.map((p) => p.postcode));

  let geocoded = 0;
  let failed = 0;

  await Promise.all(
    properties.map(async (property) => {
      const coords = coordsByPostcode.get(property.postcode);
      if (coords) {
        await prisma.property.update({ where: { id: property.id }, data: coords });
        geocoded++;
      } else {
        failed++;
      }
    })
  );

  revalidatePath("/route-map");
  return { geocoded, failed, skippedLocked };
}

export async function inviteTeamMemberAction(formData: FormData) {
  const session = await requireAdminSession();

  const email = String(formData.get("email") ?? "");
  const name = String(formData.get("name") ?? "");
  const role = String(formData.get("role") ?? "OPERATIVE") as "ADMIN" | "OPERATIVE";

  await prisma.user.create({
    data: {
      organizationId: session.user.organizationId,
      email,
      name,
      role,
      isActive: true,
    },
  });

  revalidatePath("/settings");
}
