import { NextRequest, NextResponse } from "next/server";
import { POST as subscribe, OPTIONS } from "@/app/api/greenfix/subscribe/route";
import { greenfixCorsHeaders } from "@/lib/greenfix-cors";

export { OPTIONS };

// Keep earlier website deployments working while the canonical endpoint rolls out.
export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, {
      status: 400, headers: greenfixCorsHeaders(req),
    });
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    body = { ...body, plan: body.plan ?? body.package, addressLine1: body.addressLine1 ?? body.address };
  }
  const response = await subscribe(new NextRequest(req.url, {
    method: "POST", headers: req.headers, body: JSON.stringify(body),
  }));
  const result = await response.json();
  return NextResponse.json({ ...result, success: result.ok === true }, {
    status: response.status, headers: response.headers,
  });
}
