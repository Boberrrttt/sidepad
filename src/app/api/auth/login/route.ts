import { NextResponse } from 'next/server';
import { loginUser } from '@/server/auth/auth.service';
import { COOKIE, signSession } from '@/server/auth/helpers/session';
import { jsonError } from '@/server/shared/http/errors';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const userId = await loginUser(
      String(body.username || ''),
      String(body.password || '')
    );
    const token = await signSession(userId);
    const response = NextResponse.json({ ok: true, userId });

    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (caughtError) {
    return jsonError(caughtError, { 'bad login': 401 });
  }
}
