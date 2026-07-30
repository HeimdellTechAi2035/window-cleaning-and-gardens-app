import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth",
  "/api/webhooks",
  "/portal",
  "/legal",
  "/manifest.webmanifest",
  "/sw.js",
  // /admin runs on its own standalone PlatformAdmin session (lib/admin-auth.ts),
  // entirely independent of NextAuth/tenant Users — gated by app/admin/layout.tsx
  // itself, not this middleware.
  "/admin",
  "/admin-login",
  "/admin-bootstrap",
  "/api/debug-org-secret",
];

// The admin subdomain (Netlify branch-deploy of the "admin" branch) runs
// the exact same app as the main domain, so its bare root would otherwise
// send logged-in users to /dashboard just like the main app — send it to
// /admin instead so a shortcut/relaunch that lands on "/" can't accidentally
// end up in the tenant dashboard.
const ADMIN_HOST_PREFIX = "admin--";

export default auth((req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";

  if (pathname === "/" && host.startsWith(ADMIN_HOST_PREFIX)) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)",
  ],
};
