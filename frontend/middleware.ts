import { NextRequest, NextResponse } from "next/server";

const MOBILE_UA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i;
const DESKTOP_COOKIE = "vs-desktop";

const MOBILE_MAP: Record<string, string> = {
  "/dashboard": "/mobile/home",
  "/catalog":   "/mobile/catalog",
  "/scan":      "/mobile/scan",
  "/sales":     "/mobile/sell",
};

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // If user explicitly requested desktop, set cookie and strip the param
  if (searchParams.get("desktop") === "1") {
    const dest = new URL(req.url);
    dest.searchParams.delete("desktop");
    const res = NextResponse.redirect(dest);
    res.cookies.set(DESKTOP_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  }

  // If user explicitly requested mobile, clear desktop cookie and redirect to mobile home
  if (searchParams.get("mobile") === "1") {
    const res = NextResponse.redirect(new URL("/mobile/home", req.url));
    res.cookies.set(DESKTOP_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  // Respect explicit desktop preference
  if (req.cookies.get(DESKTOP_COOKIE)?.value === "1") return NextResponse.next();

  // Magic link tokens must be processed by the dashboard page — don't redirect
  if (pathname === "/dashboard" && searchParams.has("token")) return NextResponse.next();

  const ua = req.headers.get("user-agent") ?? "";
  if (!MOBILE_UA.test(ua)) return NextResponse.next();

  // Redirect mobile UA on desktop routes
  const mobileTarget = MOBILE_MAP[pathname];
  if (mobileTarget) {
    return NextResponse.redirect(new URL(mobileTarget, req.url));
  }

  // Root redirect
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/mobile/home", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard", "/catalog", "/scan", "/sales"],
};
