import { NextResponse } from 'next/server';
import { COOKIE } from '@/server/auth/helpers/session';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
