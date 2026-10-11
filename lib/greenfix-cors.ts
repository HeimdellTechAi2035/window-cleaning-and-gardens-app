const ALLOWED_ORIGINS = [
  "https://greenfixexterior-care.co.uk",
  "https://www.greenfixexterior-care.co.uk",
];

export function greenfixCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  return {
    ...(ALLOWED_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
