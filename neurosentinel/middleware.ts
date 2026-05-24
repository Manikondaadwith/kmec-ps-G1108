import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware: pure cookie-check, zero network calls.
 *
 * @supabase/ssr's getSession() can silently trigger a token-refresh HTTP
 * request when the JWT is near expiry — that round-trip exceeds Vercel Edge's
 * ~1 s budget and causes MIDDLEWARE_INVOCATION_TIMEOUT.
 *
 * Fix: read the raw Supabase auth cookie directly. It is set by the browser
 * on every request, so checking its presence tells us "logged in or not"
 * without any network I/O. Real token verification still happens in every
 * API route and Server Component via createServerClient + getUser().
 */

// Supabase stores the session in a cookie named sb-<project-ref>-auth-token.
// The project ref is the subdomain of your Supabase URL.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0]
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`

function isLoggedIn(request: NextRequest): boolean {
  // Primary: check the standard Supabase auth token cookie
  if (request.cookies.has(AUTH_COOKIE_NAME)) return true

  // Fallback: some Supabase versions split the token across numbered chunks
  // e.g. sb-<ref>-auth-token.0, sb-<ref>-auth-token.1
  const chunkCookie = `${AUTH_COOKIE_NAME}.0`
  if (request.cookies.has(chunkCookie)) return true

  return false
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const loggedIn = isLoggedIn(request)

  const isAuthPage = pathname === '/' || pathname === '/login'
  const isProtectedPage =
    pathname.startsWith('/dashboard') ||
    pathname === '/onboarding' ||
    pathname.startsWith('/report/')

  if (!loggedIn && isProtectedPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (loggedIn && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
