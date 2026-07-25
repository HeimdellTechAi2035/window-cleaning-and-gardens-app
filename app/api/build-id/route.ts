import { NextResponse } from "next/server";

// Always reflects whichever deploy is currently serving requests — never
// cached, so a client can compare it against the build it was loaded with.
//
// COMMIT_REF is only populated in Netlify's *build* environment, not at
// request time in the deployed function, so reading it directly here would
// always be empty. NEXT_PUBLIC_BUILD_ID is inlined as a literal at build
// time by Next.js (for server code too, not just client bundles), which is
// what actually makes this reflect the deploy that's currently live.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
