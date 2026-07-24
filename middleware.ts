import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE, isValidSession } from './lib/session';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const publicPath =
    pathname === '/login' ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/register') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/workbox-') ||
    pathname.startsWith('/swe-worker-') ||
    pathname === '/favicon.ico';

  const ok = await isValidSession(req.cookies.get(COOKIE)?.value);

  if (
    pathname.startsWith('/api/') &&
    pathname !== '/api/login' &&
    pathname !== '/api/register'
  ) {
    if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return NextResponse.next();
  }

  if (publicPath) {
    if (ok && pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  if (!ok) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
