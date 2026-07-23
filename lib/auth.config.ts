import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      role: "ADMIN" | "OPERATIVE";
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    organizationId?: string;
    role?: "ADMIN" | "OPERATIVE";
  }
}

// A provider with an empty clientId/clientSecret makes NextAuth v5 throw a
// generic "Server error" Configuration error on every auth request, not
// just sign-ins through that provider — so only register it when both
// credentials are actually present.
const baseProviders: Provider[] = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  baseProviders.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

/**
 * Edge-safe base config: no Prisma adapter, no bcrypt/Credentials — those
 * pull in Node-only APIs that can't run in the Edge Runtime middleware
 * uses. The full config in lib/auth.ts extends this for route handlers
 * and server components; middleware.ts uses this one directly.
 */
export const authConfig: NextAuthConfig = {
  // Required on hosts other than Vercel (e.g. Netlify) so NextAuth trusts
  // the proxy's forwarded host/proto headers instead of rejecting them.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: baseProviders,
};
