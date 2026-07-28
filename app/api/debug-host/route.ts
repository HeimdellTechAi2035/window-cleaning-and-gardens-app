import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
  const h = await headers();
  return NextResponse.json({
    host: h.get("host"),
    xForwardedHost: h.get("x-forwarded-host"),
    xNfDeployId: h.get("x-nf-deploy-id"),
    xNfSiteName: h.get("x-nf-site-name"),
  });
}
