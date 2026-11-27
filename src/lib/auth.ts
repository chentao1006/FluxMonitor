import { SignJWT, jwtVerify } from 'jose';

const DEFAULT_JWT_SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';

export interface SessionPayload {
  username: string;
}

function getJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
}

export async function signSessionToken(username: string, expirationTime: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expirationTime)
    .sign(getJwtSecretBytes());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), { algorithms: ['HS256'] });
    if (typeof payload.username !== 'string' || payload.username.length === 0) {
      return null;
    }
    return { username: payload.username };
  } catch {
    return null;
  }
}
