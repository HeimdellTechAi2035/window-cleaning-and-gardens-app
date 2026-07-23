import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

interface AppJWT extends JWT {
  organizationId: string;
  role: "ADMIN" | "OPERATIVE";
}

// Same rule as the Google provider in auth.config.ts: an empty apiKey
// throws a Configuration error on every auth request, so only enable
// magic-link email sign-in once RESEND_API_KEY is actually set.
const fullProviders: Provider[] = [...authConfig.providers];
if (process.env.RESEND_API_KEY) {
  fullProviders.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...fullProviders,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
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
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const appToken = token as AppJWT;
      if (user) {
        appToken.organizationId = user.organizationId as string;
        appToken.role = user.role as "ADMIN" | "OPERATIVE";
      } else if (!appToken.organizationId && appToken.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: appToken.email as string },
        });
        if (dbUser) {
          appToken.organizationId = dbUser.organizationId;
          appToken.role = dbUser.role;
          appToken.sub = dbUser.id;
        }
      }
      return appToken;
    },
    async session({ session, token }) {
      const appToken = token as AppJWT;
      if (session.user) {
        session.user.id = appToken.sub as string;
        session.user.organizationId = appToken.organizationId;
        session.user.role = appToken.role;
      }
      return session;
    },
  },
});
