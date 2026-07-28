import { auth } from "@/lib/auth";

/**
 * Super-admin access (see every organization, edit any user, reset any
 * password) is gated purely by email against SUPER_ADMIN_EMAILS — not a
 * database flag — so granting/revoking it is a one-line env var change,
 * with no risk of a stray DB flag surviving unnoticed.
 */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user || !isSuperAdminEmail(session.user.email)) {
    throw new Error("Not authorized");
  }
  return session;
}
