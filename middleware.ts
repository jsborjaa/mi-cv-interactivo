import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/cv.md"],
};

export function middleware(req: NextRequest) {
  const referer = req.headers.get("referer") ?? "";
  const secFetchSite = req.headers.get("sec-fetch-site") ?? "";

  // Permite solo peticiones que vienen del mismo origen
  const isSameOrigin =
    secFetchSite === "same-origin" || secFetchSite === "none";

  // Fallback: si el navegador no envía sec-fetch-site, revisamos el referer
  const host = req.headers.get("host") ?? "";
  const refererIsSameHost = referer === "" || referer.includes(host);

  if (!isSameOrigin && !refererIsSameHost) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return NextResponse.next();
}
