import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AdminSessionPayload {
  id: string;
  email: string;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

/**
 * A deliberately separate, minimal session mechanism for /admin — no
 * NextAuth involved at all, so a platform admin's session can never be
 * confused with (or fall back to) a tenant User/Organization session. The
 * cookie is a signed JSON payload + expiry, verified with an HMAC over
 * AUTH_SECRET; no external session store needed for a single admin login.
 */
export async function createAdminSession(payload: AdminSessionPayload): Promise<void> {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const signature = sign(body);
  const token = `${body}.${signature}`;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expectedSignature = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminSessionPayload & {
      exp: number;
    };
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return { id: parsed.id, email: parsed.email };
  } catch {
    return null;
  }
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
