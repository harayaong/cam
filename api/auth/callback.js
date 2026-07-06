const crypto = require("crypto");

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

function clearAuthCookies() {
  return [
    "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    "oauth_next=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    "storyline_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  ];
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signSession(payload, secret) {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function isAllowedUser(payload) {
  if (!payload.email || payload.email_verified !== true) return false;

  const allowedEmails = (process.env.GOOGLE_ALLOWED_EMAILS || "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  if (allowedEmails.length) return allowedEmails.includes(String(payload.email).toLowerCase());

  const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN;
  if (!allowedDomain) return true;
  return String(payload.email).toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`);
}

module.exports = async function handler(req, res) {
  try {
    const { createRemoteJWKSet, jwtVerify } = await import("jose");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const authSecret = process.env.AUTH_SECRET;
    if (!clientId || !clientSecret || !authSecret) {
      res.statusCode = 500;
      res.end("Missing auth environment variables");
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    if (!req.query.code || !req.query.state || req.query.state !== cookies.oauth_state) {
      res.statusCode = 400;
      res.setHeader("Set-Cookie", clearAuthCookies());
      res.end("Invalid OAuth state");
      return;
    }

    const origin = process.env.APP_ORIGIN || getOrigin(req);
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      res.statusCode = 401;
      res.setHeader("Set-Cookie", clearAuthCookies());
      res.end("Google token exchange failed");
      return;
    }

    const tokenData = await tokenRes.json();
    const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
    const { payload } = await jwtVerify(tokenData.id_token, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });

    if (!isAllowedUser(payload)) {
      res.statusCode = 403;
      res.setHeader("Set-Cookie", clearAuthCookies());
      res.end("This Google account is not allowed.");
      return;
    }

    const maxAge = 8 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    const session = signSession({
      email: payload.email,
      name: payload.name || "",
      picture: payload.picture || "",
      iat: now,
      exp: now + maxAge,
    }, authSecret);

    res.statusCode = 302;
    res.setHeader("Set-Cookie", [
      "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "oauth_next=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      `storyline_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
    ]);
    res.setHeader("Location", safeNext(cookies.oauth_next));
    res.end();
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Set-Cookie", clearAuthCookies());
    res.end("Authentication failed");
  }
};
