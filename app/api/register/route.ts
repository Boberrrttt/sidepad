import { NextResponse } from 'next/server';
import { COOKIE, createUser, signSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const userId = await createUser(
      String(body.username || ''),
      String(body.password || '')
    );
    const token = await signSession(userId);
    const res = NextResponse.json({ ok: true, userId });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status =
      msg === 'username taken' ||
      msg === 'bad username' ||
      msg === 'password too short'
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
