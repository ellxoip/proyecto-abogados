import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/registro",
  "/api/auth",
  "/api/casos",
  "/api/webhooks/",
  "/api/crm",
  "/api/v1",
  "/api/internal/",
  "/api/integration/",
  "/api/cron/",
];

// NextAuth v5 cookie names (Auth.js renamed from "next-auth" to "authjs").
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

async function readSessionToken(req: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const isHttps =
    req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

  for (const cookieName of SESSION_COOKIE_NAMES) {
    if (!req.cookies.get(cookieName)) continue;
    try {
      const token = await getToken({ req, secret, secureCookie: isHttps, cookieName });
      if (token) return token;
    } catch {
      // Probar el siguiente nombre de cookie.
    }
  }
  // Ultimo intento usando los defaults de getToken.
  return getToken({ req, secret, secureCookie: isHttps });
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = await readSessionToken(req);

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = token.role;
  if (pathname.startsWith("/portal") && role !== "CLIENTE") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (pathname.startsWith("/admin") && role === "CLIENTE") {
    return NextResponse.redirect(new URL("/portal", req.url));
  }
  if (
    (pathname.startsWith("/admin/productividad") ||
      pathname.startsWith("/admin/mora") ||
      pathname.startsWith("/admin/monitoreo")) &&
    role !== "SUPER_ADMIN"
  ) {
    return NextResponse.redirect(new URL("/admin/casos", req.url));
  }

  // Cliente con password temporal: forzar rotación antes de cualquier otra
  // ruta del portal. La página /portal/cambiar-password está exenta (es la
  // única forma de bajar el flag).
  if (
    role === "CLIENTE" &&
    token.mustChangePassword === true &&
    pathname.startsWith("/portal") &&
    !pathname.startsWith("/portal/cambiar-password")
  ) {
    return NextResponse.redirect(new URL("/portal/cambiar-password", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, fonts, and any path that ends with a file extension
  // (so static assets in /public/** are served directly without auth redirects).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|brand/|.*\\..*).*)"],
};
