const crypto = require("crypto");

function safeNext(value) {
  if (!value || typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers.host}`;
}

module.exports = function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 500;
    res.end("Missing GOOGLE_CLIENT_ID");
    return;
  }

  const origin = process.env.APP_ORIGIN || getOrigin(req);
  const state = crypto.randomBytes(24).toString("hex");
  const next = safeNext(req.query.next);
  const maxAge = 10 * 60;

  res.setHeader("Set-Cookie", [
    `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
    `oauth_next=${encodeURIComponent(next)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
  ]);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");
  if (process.env.GOOGLE_ALLOWED_DOMAIN) {
    authUrl.searchParams.set("hd", process.env.GOOGLE_ALLOWED_DOMAIN);
  }

  res.statusCode = 302;
  res.setHeader("Location", authUrl.toString());
  res.end();
};
