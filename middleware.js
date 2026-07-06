const SESSION_COOKIE = "storyline_session";

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const idx = part.indexOf("=");
        return idx < 0 ? [part, ""] : [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

function isPublicPath(pathname) {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

function redirectToLogin(request, url) {
  const login = new URL("/api/auth/start", url.origin);
  login.searchParams.set("next", url.pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: { Location: login.toString() },
  });
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

export const config = {
  runtime: "edge",
};

export default async function middleware(request) {
  const url = new URL(request.url);
  if (isPublicPath(url.pathname)) return;

  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];
  if (!token || !process.env.AUTH_SECRET) return redirectToLogin(request, url);

  if (await verifySession(token, process.env.AUTH_SECRET)) return;
  return redirectToLogin(request, url);
}
