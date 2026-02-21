import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import appConfig from "../config.json";

const secretKey = new TextEncoder().encode(appConfig.jwtSecret);

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Protect /dashboard routes and /api routes (except /api/auth/login)
  const isProtectedRoute = path.startsWith('/dashboard') || (path.startsWith('/api') && !path.startsWith('/api/auth/login'));

  if (isProtectedRoute) {
    const token = request.cookies.get('token')?.value;

    if (!token) {
      if (path.startsWith('/api')) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      await jwtVerify(token, secretKey);
      return NextResponse.next();
    } catch (error) {
      if (path.startsWith('/api')) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Redirect authenticated users away from /login
  if (path === '/login') {
    const token = request.cookies.get('token')?.value;
    if (token) {
      try {
        await jwtVerify(token, secretKey);
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } catch (error) {
        // Token invalid, let them stay on login page
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/login'],
};
