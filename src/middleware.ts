import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE, isValidSession } from '@/shared/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath =
    pathname === '/auth/login' ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/register') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/workbox-') ||
    pathname.startsWith('/swe-worker-') ||
    pathname === '/favicon.ico';

  const hasValidSession = await isValidSession(request.cookies.get(COOKIE)?.value);

  if (
    pathname.startsWith('/api/') &&
    pathname !== '/api/auth/login' &&
    pathname !== '/api/auth/register'
  ) {
    if (!hasValidSession) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    return NextResponse.next();
  }

  if (isPublicPath) {
    if (hasValidSession && pathname === '/auth/login') {
      return NextResponse.redirect(new URL('/notes', request.url));
    }

    return NextResponse.next();
  }

  if (!hasValidSession) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/notes', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
