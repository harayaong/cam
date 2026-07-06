export function middleware(request) {
  if (request.nextUrl.pathname.startsWith("/api/auth/")) return;

  const url = new URL("/api/auth/start", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return Response.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};
