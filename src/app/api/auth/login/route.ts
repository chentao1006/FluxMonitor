import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { getConfig } from '@/lib/config';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    const config = getConfig();

    const user = (config.users || []).find(
      (u: { username: string; password: string }) => u.username === username && u.password === password
    );

    if (user) {
      const secretKey = new TextEncoder().encode(config.jwtSecret || 'CHANGE_ME_TO_A_LONG_RANDOM_STRING');
      const token = await new SignJWT({ username: user.username })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('24h')
        .sign(secretKey);

      const isHttps = request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');

      const cookieStore = await cookies();
      cookieStore.set('token', token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 1 day
        path: '/',
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
