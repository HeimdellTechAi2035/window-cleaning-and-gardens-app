import { NextResponse } from "next/server";

// Always reflects whichever deploy is currently serving requests — never
// cached, so a client can compare it against the build it was loaded with.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { buildId: process.env.COMMIT_REF ?? "" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
