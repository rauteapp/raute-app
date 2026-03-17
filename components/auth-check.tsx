"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Skeleton } from "@/components/ui/skeleton"
import { Capacitor } from "@capacitor/core"
import { restoreSessionFromBackup } from "@/components/auth-listener"

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signup', '/', '/verify-email', '/auth/callback', '/pending-activation', '/privacy', '/terms', '/forgot-password', '/update-password', '/welcome-setup', '/onboarding', '/refund-policy', '/cancellation-policy', '/acceptable-use', '/contact', '/promotional-terms', '/legal-restrictions', '/cookies', '/dpa']

// Global flag: set to true when user explicitly clicks "Logout".
// This tells the SIGNED_OUT handler to skip recovery attempts.
// Exported so profile/login pages can set it before calling signOut().
let _intentionalLogout = false
let _intentionalLogoutTimeout: ReturnType<typeof setTimeout> | null = null
export function markIntentionalLogout() {
    _intentionalLogout = true
    // Safety: auto-reset after 10s in case SIGNED_OUT event never fires
    // (e.g., network error during signOut). Prevents flag from staying
    // true forever, which would make all future sign-outs skip recovery.
    if (_intentionalLogoutTimeout) clearTimeout(_intentionalLogoutTimeout)
    _intentionalLogoutTimeout = setTimeout(() => {
        _intentionalLogout = false
        _intentionalLogoutTimeout = null
    }, 10000)
}

export default function AuthCheck({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const isMarketingPage = pathname === '/' || pathname === '/privacy' || pathname === '/terms'
    // Don't show skeleton on public routes (login, signup, etc) — render immediately
    const isPublicPage = PUBLIC_ROUTES.some(route =>
        pathname === route || pathname === `${route}/` || pathname.startsWith(`${route}/`)
    )
    const [isLoading, setIsLoading] = useState(() => !isMarketingPage && !isPublicPage)

    // Use ref for redirect cooldown to avoid re-renders
    const lastRedirectRef = useRef<number>(0)
    // Track if component is mounted to avoid state updates after unmount
    const isMountedRef = useRef(true)
    // Track if auth check is already running to prevent duplicates
    const authCheckRunningRef = useRef(false)
    // Track if we already resolved (session found or redirected)
    const resolvedRef = useRef(false)
    // Track if we've confirmed a valid session (prevents skeleton flash between protected routes)
    const sessionConfirmedRef = useRef(false)

    const isPublicRoute = useMemo(() => {
        return PUBLIC_ROUTES.some(route =>
            pathname === route || pathname.startsWith(`${route}/`)
        )
    }, [pathname])

    // Helper: check if driver is pending activation
    const checkDriverActivation = async (userId: string, role: string | null) => {
        if (role !== 'driver' || pathname === '/pending-activation') return false
        try {
            const { data: driverData } = await supabase
                .from('drivers')
                .select('is_active')
                .eq('user_id', userId)
                .single()
            if (driverData && !driverData.is_active) {
                window.location.href = '/pending-activation'
                return true // blocked
            }
        } catch {}
        return false
    }

    // Helper: stop loading and mark resolved
    const finishLoading = () => {
        if (isMountedRef.current) setIsLoading(false)
        authCheckRunningRef.current = false
        resolvedRef.current = true
        sessionConfirmedRef.current = true
    }

    // Helper: redirect to login (with cooldown)
    const redirectToLogin = (reason?: string) => {
        if (!isMountedRef.current || isPublicRoute || resolvedRef.current) return
        const now = Date.now()
        if (now - lastRedirectRef.current > 3000) {
            lastRedirectRef.current = now
            resolvedRef.current = true
            sessionConfirmedRef.current = false
            authCheckRunningRef.current = false
            // Keep loading spinner visible during redirect — don't flash empty content
            // Always use hard redirect — router.push can get stuck when
            // navigator.locks are deadlocked or RSC prefetch hangs
            window.location.href = '/login'
        }
    }

    useEffect(() => {
        isMountedRef.current = true
        resolvedRef.current = false

        // For marketing pages, skip all auth checks
        if (isMarketingPage) {
            return
        }

        // If session was already confirmed (navigating between protected routes),
        // skip the loading state and full auth re-check. We still set up the
        // onAuthStateChange listener below to catch SIGNED_OUT events.
        const skipFullCheck = !isPublicRoute && sessionConfirmedRef.current

        if (skipFullCheck) {
            resolvedRef.current = true
        }

        // When entering a protected route without a previously confirmed session,
        // show loading until we verify. This prevents rendering children before
        // auth is confirmed (e.g. navigating from /login to /dashboard after login).
        if (!isPublicRoute && !sessionConfirmedRef.current) {
            setIsLoading(true)
        }

        // Prevent duplicate auth checks
        if (authCheckRunningRef.current && !skipFullCheck) {
            return
        }

        const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

        // TIMEOUT: Force resolve after timeout
        // On web: 8s is enough. On native: 15s for Capacitor bridge delays.
        const maxTimeoutMs = isNative ? 15000 : 8000
        const maxTimeout = setTimeout(async () => {
            if (resolvedRef.current) return

            if (!isPublicRoute) {
                if (isNative) {
                    // On native, check Capacitor Preferences for stored session
                    let hasStoredAuth = false
                    try {
                        const { capacitorStorage } = await import('@/lib/capacitor-storage')
                        const stored = await capacitorStorage.getItem('sb-raute-auth')
                        hasStoredAuth = !!stored
                        if (!hasStoredAuth) {
                            const { Preferences } = await import('@capacitor/preferences')
                            const { value } = await Preferences.get({ key: 'raute-session-backup' })
                            hasStoredAuth = !!value
                        }
                    } catch {
                        hasStoredAuth = false
                    }

                    if (hasStoredAuth) {
                        finishLoading()
                        return
                    }
                    redirectToLogin('timeout')
                } else {
                    // On web: getSession() is stuck (navigator.locks deadlock).
                    // Use getUser() as a direct API call to verify auth status.
                    try {
                        const { data: userData, error: userError } = await Promise.race([
                            supabase.auth.getUser(),
                            new Promise<never>((_, reject) =>
                                setTimeout(() => reject(new Error('getUser timeout')), 5000)
                            ),
                        ])
                        if (!userError && userData.user) {
                            // User is authenticated — let them through
                            finishLoading()
                            return
                        }
                    } catch {
                        // getUser also failed/timed out
                    }
                    redirectToLogin('timeout')
                }
            } else {
                finishLoading()
            }
        }, maxTimeoutMs)

        let getSessionTimeoutCount = 0

        const checkAuth = async (retries: number) => {
            if (resolvedRef.current) return
            authCheckRunningRef.current = true

            try {
                // On web, after 2 getSession timeouts, try getUser() as fallback.
                // getUser() bypasses navigator.locks and makes a direct API call.
                if (!isNative && getSessionTimeoutCount >= 2) {
                    try {
                        const { data: userData, error: userError } = await Promise.race([
                            supabase.auth.getUser(),
                            new Promise<never>((_, reject) =>
                                setTimeout(() => reject(new Error('getUser timeout')), 5000)
                            ),
                        ])
                        if (!userError && userData.user) {
                            if (!userData.user.email_confirmed_at && pathname !== '/verify-email') {
                                const now = Date.now()
                                if (now - lastRedirectRef.current > 3000) {
                                    lastRedirectRef.current = now
                                    window.location.href = '/verify-email'
                                }
                            }
                            clearTimeout(maxTimeout)
                            finishLoading()
                            return
                        }
                    } catch {
                        // getUser also failed — continue with normal flow
                    }
                }

                const { data, error } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('getSession timeout')), 5000)
                    ),
                ])

                if (error) {
                    console.error("❌ Auth error:", error.message)

                    // Handle corrupted session
                    if (error.message.includes('string did not match') ||
                        error.message.includes('pattern') ||
                        error.message.includes('Invalid')) {
                        try {
                            await supabase.auth.signOut({ scope: 'local' })
                            if (isNative) {
                                const { capacitorStorage } = await import('@/lib/capacitor-storage')
                                await capacitorStorage.clearAllAuthData()
                            }
                        } catch (cleanupErr) {
                            console.error('Cleanup failed:', cleanupErr)
                        }
                        clearTimeout(maxTimeout)
                        redirectToLogin('session_invalid')
                        return
                    }

                    clearTimeout(maxTimeout)
                    finishLoading()
                    return
                }

                // SESSION FOUND
                if (data.session) {
                    // Validate session data
                    if (!data.session.access_token || !data.session.user) {
                        console.error('❌ Invalid session data, clearing')
                        await supabase.auth.signOut({ scope: 'local' })
                        clearTimeout(maxTimeout)
                        redirectToLogin('invalid_session')
                        return
                    }

                    // Check if access token is expired or about to expire.
                    // getSession() returns cached data — if the refresh token is invalid,
                    // the cached session has an expired access_token that will 403 on every API call.
                    const expiresAt = data.session.expires_at
                    const isExpired = expiresAt && expiresAt * 1000 < Date.now()

                    if (isExpired) {
                        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
                        if (refreshError || !refreshData.session) {
                            console.error('❌ Token refresh failed:', refreshError?.message)
                            try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
                            clearTimeout(maxTimeout)
                            redirectToLogin('token_refresh_failed')
                            return
                        }
                    }

                    // Verify the token is actually valid server-side.
                    // getSession() only reads cached data — the token may have been
                    // revoked (e.g. password changed on another device) but still has
                    // time left on expires_at. getUser() makes a real API call to check.
                    if (!isExpired) {
                        try {
                            const { error: verifyError } = await Promise.race([
                                supabase.auth.getUser(),
                                new Promise<{ data: { user: null }, error: { status: number } }>((resolve) =>
                                    setTimeout(() => resolve({ data: { user: null }, error: { status: 408 } }), 4000)
                                ),
                            ])
                            if (verifyError && (verifyError.status === 403 || verifyError.status === 401)) {
                                try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
                                clearTimeout(maxTimeout)
                                redirectToLogin('token_revoked')
                                return
                            }
                        } catch {
                            // Network error or timeout — let them through, dashboard will handle it
                        }
                    }

                    // Check email verification
                    if (!data.session.user.email_confirmed_at && pathname !== '/verify-email') {
                        const now = Date.now()
                        if (now - lastRedirectRef.current > 3000) {
                            lastRedirectRef.current = now
                            window.location.href = '/verify-email'
                        }
                    }

                    // Check if driver needs activation before allowing access
                    const userRole = data.session.user.user_metadata?.role
                    if (userRole === 'driver') {
                        const blocked = await checkDriverActivation(data.session.user.id, userRole)
                        if (blocked) {
                            clearTimeout(maxTimeout)
                            authCheckRunningRef.current = false
                            resolvedRef.current = true
                            return
                        }
                    }

                    clearTimeout(maxTimeout)
                    finishLoading()
                    return
                }

                // NO SESSION — on native, try direct storage recovery early (after 2 retries)
                // because getSession() only reads from Supabase's in-memory state.
                // If _initialize() failed to read from Capacitor Preferences (bridge not ready),
                // all subsequent getSession() calls return null — retrying is pointless.
                // Instead, read directly from storage and use refreshSession() to restore.
                if (isNative && retries <= 2 && !isPublicRoute) {
                    // Try Supabase's internal storage key first
                    try {
                        const { capacitorStorage } = await import('@/lib/capacitor-storage')
                        const stored = await capacitorStorage.getItem('sb-raute-auth')
                        if (stored) {
                            const parsed = JSON.parse(stored)
                            if (parsed?.refresh_token) {
                                const { data: refreshData } = await supabase.auth.refreshSession({
                                    refresh_token: parsed.refresh_token
                                })
                                if (refreshData.session) {
                                    clearTimeout(maxTimeout)
                                    finishLoading()
                                    return
                                }
                            }
                        }
                    } catch (err) {
                    }

                    // Try redundant session backup
                    try {
                        const restored = await restoreSessionFromBackup()
                        if (restored) {
                            clearTimeout(maxTimeout)
                            finishLoading()
                            return
                        }
                    } catch (err) {
                    }
                }

                // NO SESSION — retry (session may not be persisted to cookies yet)
                // On web: cookies from signInWithPassword may take a moment to be readable
                // On native: continue retrying in case Capacitor bridge becomes ready
                if (retries > 0) {
                    setTimeout(() => {
                        if (isMountedRef.current && !resolvedRef.current) checkAuth(retries - 1)
                    }, 500)
                    return
                }

                // NO SESSION on web — no retries needed (cookies are instant)
                // Give up and redirect to login
                clearTimeout(maxTimeout)
                if (!isPublicRoute) {
                    redirectToLogin('no_session')
                } else {
                    finishLoading()
                }

            } catch (error: any) {
                // AbortError or getSession timeout from navigator.locks — lock held by token refresh
                const isLockTimeout = error?.name === 'AbortError' ||
                    error?.message?.includes('aborted') ||
                    error?.message?.includes('timeout')

                if (!isLockTimeout) {
                    console.error("❌ Auth check failed:", error)
                } else {
                    console.warn("⚠️ Auth check timeout:", error?.message)
                }

                if (isLockTimeout) {
                    getSessionTimeoutCount++
                    if (retries > 0) {
                        setTimeout(() => {
                            if (isMountedRef.current && !resolvedRef.current) checkAuth(retries - 1)
                        }, 1000)
                        return
                    }
                }

                if (error?.message?.includes('string did not match') || error?.message?.includes('pattern')) {
                    try {
                        await supabase.auth.signOut({ scope: 'local' })
                        if (isNative) {
                            const { capacitorStorage } = await import('@/lib/capacitor-storage')
                            await capacitorStorage.clearAllAuthData()
                        }
                    } catch {}
                }
                clearTimeout(maxTimeout)
                if (!isPublicRoute) {
                    redirectToLogin('error')
                } else {
                    finishLoading()
                }
            }
        }

        // Subscribe to auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
                sessionConfirmedRef.current = false

                // If this was an intentional logout (user clicked Logout button),
                // skip all recovery attempts and redirect immediately.
                if (_intentionalLogout) {
                    _intentionalLogout = false
                    if (_intentionalLogoutTimeout) {
                        clearTimeout(_intentionalLogoutTimeout)
                        _intentionalLogoutTimeout = null
                    }
                    if (isMountedRef.current && !isPublicRoute) {
                        window.location.href = '/login'
                    }
                    return
                }

                // False SIGNED_OUT: Supabase fires this when auto token refresh fails
                // (e.g. AbortError on resume, race conditions with detectSessionInUrl).
                // Verify server-side before redirecting — but do NOT trust getSession()
                // because it returns stale cached data even after the token is invalid.
                if (isMountedRef.current && !isPublicRoute) {
                    // Small delay — let any in-flight token refresh settle
                    await new Promise(resolve => setTimeout(resolve, 500))
                    if (!isMountedRef.current) return

                    try {
                        // Go straight to server-side check — getUser() makes an actual API call.
                        // Do NOT use getSession() here: it returns stale cached sessions
                        // even when the refresh token is invalid (403), causing the app
                        // to think the session is valid when it's not.
                        const { data: userData, error: userError } = await Promise.race([
                            supabase.auth.getUser(),
                            new Promise<never>((_, reject) =>
                                setTimeout(() => reject(new Error('getUser timeout')), 5000)
                            ),
                        ])

                        if (!userError && userData.user) {
                            const { data: refreshData } = await supabase.auth.refreshSession()
                            if (refreshData.session) {
                                sessionConfirmedRef.current = true
                                return
                            }
                        }

                        // Clear any stale cached session data and redirect
                        try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
                        window.location.href = '/login'
                    } catch {
                        // Network error or timeout — on native, do NOT wipe session.
                        // The user may just have spotty connectivity. Keep session in
                        // storage so they can recover when back online.
                        if (isNative) {
                            // Stay on current page — session might still be valid
                            return
                        }
                        // On web, redirect to login (cookies persist independently)
                        try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
                        window.location.href = '/login'
                    }
                }
            } else if (event === 'INITIAL_SESSION') {
                if (session && isMountedRef.current) {
                    clearTimeout(maxTimeout)
                    finishLoading()
                } else if (!session && isNative && !isPublicRoute) {
                    // On native, INITIAL_SESSION fires before Preferences is ready
                    // Let checkAuth handle the retries
                }
                // On web, if INITIAL_SESSION has no session, checkAuth will handle redirect
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session && isMountedRef.current) {
                    clearTimeout(maxTimeout)
                    finishLoading()
                }
            }
        })

        // Start auth check (skip if session already confirmed from previous route)
        if (!skipFullCheck) {
            if (isNative) {
                // Native: small delay for Preferences init, then retry up to 4 times
                setTimeout(() => {
                    if (isMountedRef.current && !resolvedRef.current) checkAuth(4)
                }, 300)
            } else {
                // Web: retry up to 3 times with 500ms delay between attempts.
                // After login, cookies may not be immediately readable by getSession().
                checkAuth(3)
            }
        }

        return () => {
            isMountedRef.current = false
            authCheckRunningRef.current = false
            clearTimeout(maxTimeout)
            subscription.unsubscribe()
        }
    // CRITICAL: Only re-run when pathname changes. Do NOT include state variables
    // that change during the effect (like lastRedirect) — that causes infinite loops.
    }, [pathname, isPublicRoute, isMarketingPage]) // eslint-disable-line react-hooks/exhaustive-deps

    // Public and marketing pages render immediately (no skeleton)
    if (isMarketingPage || isPublicPage) {
        return <>{children}</>
    }

    // Show loading screen while checking auth
    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-6">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="h-12 w-12 rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 dark:border-t-blue-400 animate-spin" />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Loading your dashboard</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Please wait...</p>
                    </div>
                </div>
                <div className="w-48 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 dark:bg-blue-400 rounded-full animate-[loading-bar_2s_ease-in-out_infinite]" />
                </div>
                <style jsx>{`
                    @keyframes loading-bar {
                        0% { width: 0%; margin-left: 0; }
                        50% { width: 60%; margin-left: 20%; }
                        100% { width: 0%; margin-left: 100%; }
                    }
                `}</style>
            </div>
        )
    }

    return <>{children}</>
}
