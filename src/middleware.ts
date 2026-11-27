import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const isProtectedRoute = path.startsWith('/dashboard') || (path.startsWith('/api') && !path.startsWith('/api/auth/login') && !path.startsWith('/api/info'));

  if (isProtectedRoute) {
    const token = request.cookies.get('token')?.value;

    if (!token) {
      if (path.startsWith('/api')) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const session = await verifySessionToken(token);
    if (!session) {
      if (path.startsWith('/api')) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  if (path === '/login') {
    const token = request.cookies.get('token')?.value;
    if (token && (await verifySessionToken(token))) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/login'],
};
