import { auth } from "@/lib/auth";

/**
 * Super-admin access (see every organization, edit any user, reset any
 * password) is gated by an explicit isPlatformSuperAdmin flag on the User
 * row — never by matching the logged-in email against a list, since
 * registration is public and anyone could otherwise race to register a
 * known/guessable email first and be granted admin. The flag can only be
 * set via the one-time bootstrap action (lib/super-admin-bootstrap.ts) or
 * by an existing super-admin from within /admin.
 */
export function isSuperAdminSession(session: { user?: { isPlatformSuperAdmin?: boolean } } | null): boolean {
  return session?.user?.isPlatformSuperAdmin === true;
}

export async function requireSuperAdmin() {
  const session = await auth();
  if (!isSuperAdminSession(session)) {
    throw new Error("Not authorized");
  }
  return session!;
}
