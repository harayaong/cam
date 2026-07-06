const SESSION_COOKIE = "storyline_session";

function isPublicPath(pathname) {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

function loginUrl(request) {
  const url = new URL("/api/auth/start", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return url;
}

function base64urlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmacSha256(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function verifySession(token, secret) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return false;
  const expected = await hmacSha256(body, secret);
  if (expected !== signature) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !process.env.AUTH_SECRET) {
    return Response.redirect(loginUrl(request));
  }

  if (await verifySession(token, process.env.AUTH_SECRET)) return;
  return Response.redirect(loginUrl(request));
}

export const config = {
  matcher: ["/((?!_next/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)"],
};
