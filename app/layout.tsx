import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

// The admin subdomain (Netlify branch-deploy of "admin") runs this exact
// same app, so any page here (login, dashboard, etc.) would otherwise link
// the root manifest — whose scope "/" is broader than /admin's own scope
// "/admin". Once a browser sees that broader-scope app as installable (e.g.
// during the login page it's forced through), it treats /admin as part of
// the SAME app rather than a separate one. Linking the admin manifest from
// every page on that host closes that off entirely.
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host") ?? "";
  const isAdminHost = host.startsWith("admin--");

  return {
    title: "RoundFlow — Round & Payment Management",
    description:
      "Round scheduling, route optimization, and automated payments for window cleaning and gardening businesses.",
    manifest: isAdminHost ? "/admin/manifest.webmanifest" : "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/favicon.png", type: "image/png" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "RoundFlow",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
