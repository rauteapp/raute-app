import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    // Force HTTPS redirect (before any other checks)
    // Skip on localhost (dev server doesn't support HTTPS)
    const host = request.headers.get('host') || ''
    const proto = request.headers.get('x-forwarded-proto')
    if (proto === 'http' && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
        const url = request.nextUrl.clone()
        url.protocol = 'https:'
        return NextResponse.redirect(url, 301)
    }

    // Skip middleware entirely for landing page and marketing pages
    const marketingPages = ['/', '/privacy', '/terms']
    if (marketingPages.includes(request.nextUrl.pathname)) {
        return NextResponse.next()
    }

    // PUBLIC ROUTES — always allow access
    const publicRoutes = ['/login', '/signup', '/verify-email', '/auth/callback', '/pending-activation', '/forgot-password', '/update-password', '/onboarding']
    const isPublicRoute = publicRoutes.some(route => {
        return request.nextUrl.pathname === route || request.nextUrl.pathname === `${route}/`
    })

    // Allow public tracking pages: /track/{token}
    const isTrackingRoute = request.nextUrl.pathname.startsWith('/track/')

    if (isPublicRoute || isTrackingRoute) {
        return NextResponse.next({ request: { headers: request.headers } })
    }

    // PROTECTED ROUTES — check if user has auth cookies
    //
    // IMPORTANT: We intentionally do NOT call supabase.auth.getSession() here.
    //
    // Why? When the access token is expired (after 1 hour), getSession() tries
    // to refresh it server-side. If the refresh fails (common in Edge Runtime),
    // Supabase calls _removeSession() which triggers setAll() with maxAge:0
    // cookies — this DELETES the auth cookies from the browser via Set-Cookie
    // headers in the response. The client-side then has no cookies and can't
    // recover the session.
    //
    // Instead, we simply check if auth cookies exist in the request:
    // - If cookies exist → allow through, let client-side handle token refresh
    // - If no cookies → redirect to login
    //
    // The client-side Supabase client (with autoRefreshToken: true) successfully
    // refreshes expired tokens. The actual session validation, role checks, and
    // email verification are all handled by the AuthCheck component client-side.
    const hasAuthCookies = request.cookies.getAll().some(
        c => c.name.startsWith('sb-') && c.name.includes('auth-token')
    )

    if (!hasAuthCookies) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Auth cookies exist — allow through.
    // Client-side AuthCheck handles: token refresh, email verification,
    // role checks, onboarding status, etc.
    return NextResponse.next({ request: { headers: request.headers } })
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
         * - api routes (protected separately)
         */
        '/((?!_next/static|_next/image|favicon.ico|api|privacy|terms|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|ico|xml|txt)$).*)',
    ],
}
