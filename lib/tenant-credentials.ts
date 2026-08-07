import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Deliberately has no dependency on next-auth — kept as a small, isolated
// module so it can be unit tested against a mocked Prisma client without
// pulling in the real NextAuth/next-auth adapter machinery (which needs a
// Next.js request context). lib/auth.ts's Credentials provider calls this.
//
// Only ever queries `prisma.user` — the tenant table — never
// `prisma.platformAdmin`, so platform-admin credentials (which live in a
// wholly separate table with no relation to User) can never authenticate
// here, the same way tenant credentials can never authenticate at
// /admin-login (see app/actions/admin-auth.ts, which only queries
// `prisma.platformAdmin`).
export async function authorizeTenantCredentials(email: string | undefined, password: string | undefined) {
  if (!email || !password) return null;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !user.isActive) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    organizationId: user.organizationId,
    role: user.role,
  };
}
