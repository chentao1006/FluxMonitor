import { NextResponse } from 'next/server';
import { signSessionToken } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { UserConfig } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const { username, password, autoLogin } = await request.json();
    const config = getConfig();

    const user = (config.users || []).find(
      (u: UserConfig) => u.username === username && u.password === password
    );

    if (user) {
      const expirationTime = autoLogin ? '365d' : '24h';
      const maxAge = autoLogin ? 60 * 60 * 24 * 365 : 60 * 60 * 24;
      const token = await signSessionToken(user.username, expirationTime);

      const response = NextResponse.json({ success: true });
      response.headers.set(
        'Set-Cookie',
        `token=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
      );

      return response;
    }

    return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
