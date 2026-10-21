import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /admin and all its subpaths
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const authCookie = request.cookies.get("store_admin_auth");

    // 1. If cookie missing -> immediate absolute redirect to /
    if (!authCookie || !authCookie.value) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // 2. Cookie format: token.expiresAt.instanceId
    const parts = authCookie.value.split(".");
    if (parts.length >= 2) {
      const expiresAt = Number(parts[1]);
      // If 5 minutes expired -> clear cookie and redirect to /
      if (!expiresAt || isNaN(expiresAt) || Date.now() >= expiresAt) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        const response = NextResponse.redirect(url);
        response.cookies.delete("store_admin_auth");
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
