import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

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
      const secret = process.env.JWT_SECRET || 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';
      const secretKey = new TextEncoder().encode(secret);
      await jwtVerify(token, secretKey);
      return NextResponse.next();
    } catch {
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
        const secret = process.env.JWT_SECRET || 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';
        const secretKey = new TextEncoder().encode(secret);
        await jwtVerify(token, secretKey);
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } catch {
        // Token invalid, let them stay on login page
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/login'],
};
