import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/cv.md"],
};

export function proxy(req: NextRequest) {
  const secFetchSite = req.headers.get("sec-fetch-site") ?? "";

  // Only allow same-origin requests (e.g. server-side reads via the app)
  // "none" (direct navigation) is intentionally rejected to protect the raw file
  if (secFetchSite === "same-origin") {
    return NextResponse.next();
  }

  // Fallback for browsers/environments that do not send sec-fetch-site:
  // allow only if the referer belongs to the same host
  if (secFetchSite === "") {
    const referer = req.headers.get("referer") ?? "";
    const host = req.headers.get("host") ?? "";
    if (host && referer.includes(host)) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Forbidden", { status: 403 });
}
