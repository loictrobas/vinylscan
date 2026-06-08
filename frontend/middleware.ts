import { NextRequest, NextResponse } from "next/server";

const MOBILE_UA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only redirect the root — don't interfere with desktop routes users navigate to deliberately
  if (pathname !== "/") return NextResponse.next();

  const ua = req.headers.get("user-agent") ?? "";
  if (MOBILE_UA.test(ua)) {
    return NextResponse.redirect(new URL("/mobile", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
