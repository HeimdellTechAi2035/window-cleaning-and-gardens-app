import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Super-admin access (see every organization, edit any user, reset any
 * password) is gated by an explicit isPlatformSuperAdmin flag on the User
 * row — never by matching the logged-in email against a list, since
 * registration is public and anyone could otherwise race to register a
 * known/guessable email first and be granted admin. The flag can only be
 * set via the one-time bootstrap action (app/actions/super-admin-bootstrap.ts)
 * or by an existing super-admin from within /admin.
 *
 * This always re-reads the DB rather than trusting session.user.isPlatformSuperAdmin
 * from the JWT: the JWT claim is only populated at sign-in, so a user granted
 * the flag mid-session (e.g. right after bootstrapping) would otherwise stay
 * locked out of /admin until they log out and back in.
 */
export async function isCurrentUserSuperAdmin(userId: string | undefined | null): Promise<boolean> {
  if (!userId) return false;
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformSuperAdmin: true },
  });
  return dbUser?.isPlatformSuperAdmin === true;
}

export async function requireSuperAdmin() {
  const session = await auth();
  const isSuperAdmin = await isCurrentUserSuperAdmin(session?.user?.id);
  if (!isSuperAdmin) {
    throw new Error("Not authorized");
  }
  return session!;
}
