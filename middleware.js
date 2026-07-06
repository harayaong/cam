import { jwtVerify } from "jose";

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

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !process.env.AUTH_SECRET) {
    return Response.redirect(loginUrl(request));
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
    return;
  } catch {
    return Response.redirect(loginUrl(request));
  }
}

export const config = {
  matcher: ["/((?!_next/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)"],
};
