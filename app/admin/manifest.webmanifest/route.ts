import { NextResponse } from "next/server";

// Next.js's manifest.ts file-convention only generates a manifest at the
// app root — nested segments aren't supported, so this is served by hand
// as a plain route instead, giving /admin its own installable identity
// distinct from the main app's root manifest.
export async function GET() {
  return NextResponse.json(
    {
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
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
