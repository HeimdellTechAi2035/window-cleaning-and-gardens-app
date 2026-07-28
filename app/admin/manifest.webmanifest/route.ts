import { NextResponse } from "next/server";
import { adminManifest } from "@/lib/admin-manifest";

// Next.js's manifest.ts file-convention only generates a manifest at the
// app root — nested segments aren't supported, so this is served by hand
// as a plain route instead, giving /admin its own installable identity
// distinct from the main app's root manifest.
export async function GET() {
  return NextResponse.json(adminManifest, { headers: { "Content-Type": "application/manifest+json" } });
}
