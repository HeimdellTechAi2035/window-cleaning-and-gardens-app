import type { MetadataRoute } from "next";

// Shared by app/manifest.ts (served when the admin subdomain requests the
// root manifest URL — see the comment there for why) and
// app/admin/manifest.webmanifest/route.ts.
export const adminManifest: MetadataRoute.Manifest = {
  name: "RoundFlow Platform Admin",
  short_name: "RF Admin",
  description: "Platform-wide admin panel for RoundFlow — manage every organization's account.",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#0f172a",
  theme_color: "#0f172a",
  icons: [
    { src: "/icons/admin-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/admin-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/admin-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/admin-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
