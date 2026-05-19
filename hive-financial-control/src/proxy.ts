import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

const publicPaths = [
  "/login",
  "/api/auth/login",
  "/api/integrations/",
  "/api/webhooks/",
  "/api/cron/",
  "/api/internal/",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/brand/") ||
    /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|css|js|map)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const isPublic = publicPaths.some((path) => pathname.startsWith(path));
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (token) {
    try {
      await verifySession(token);
      if (pathname === "/login") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    } catch {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        expires: new Date(0),
        path: "/",
      });
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
