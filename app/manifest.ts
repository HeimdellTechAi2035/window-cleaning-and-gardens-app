import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { adminManifest } from "@/lib/admin-manifest";

// Every page still under app/layout.tsx (login, dashboard, etc.) links this
// URL for its manifest — the Metadata API's own `manifest` field can't
// override it per-page since this file-convention route wins regardless of
// what a layout's metadata specifies (unlike icons, which nested segments
// genuinely override). On the admin subdomain, /login is unavoidable during
// sign-in, so without this, the browser sees a root-scoped ("/") installable
// app there before ever reaching /admin's narrower-scoped one, and treats
// /admin as part of that same app rather than a separate install target.
// Serving the admin manifest here too (same URL, different content by host)
// closes that off.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get("host") ?? "";
  if (host.startsWith("admin--")) {
    return adminManifest;
  }

  return {
    name: "RoundFlow — Round & Payment Management",
    short_name: "RoundFlow",
    description:
      "Round scheduling, route optimization, and automated payments for window cleaning and gardening businesses.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#6366f1",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
