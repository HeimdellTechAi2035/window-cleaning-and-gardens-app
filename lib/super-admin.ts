import { getAdminSession, type AdminSessionPayload } from "@/lib/admin-auth";

/**
 * Gates every /admin route and cross-tenant server action. Backed entirely
 * by the standalone PlatformAdmin session (lib/admin-auth.ts) — no tenant
 * User/Organization involved, so there is nothing here for a self-registered
 * account to ever accidentally gain access to.
 */
export async function requireSuperAdmin(): Promise<AdminSessionPayload> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("Not authorized");
  }
  return session;
}
