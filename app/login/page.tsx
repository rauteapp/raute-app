"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/toast-provider"
import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"
import { MobileAuthWrapper } from "@/components/mobile-auth-wrapper"
import { AuthSkeleton } from "@/components/auth-skeleton"
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { backupCodeVerifier } from '@/lib/pkce-backup'
import { capacitorStorage } from '@/lib/capacitor-storage'

export default function LoginPage() {
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [checkingSession, setCheckingSession] = useState(true)
    const [apiError, setApiError] = useState<string | null>(null)
    const [redirectError, setRedirectError] = useState<string | null>(() => {
        // Read error from URL query params (set by auth/callback redirects)
        if (typeof window === 'undefined') return null
        const params = new URLSearchParams(window.location.search)
        const error = params.get('error')
        if (!error) return null
        // Map error codes to user-friendly messages
        const errorMessages: Record<string, string> = {
            'access_denied': 'Access was denied. Please try signing in again.',
            'no_session': 'Session expired. Please sign in again.',
            'verification_failed': 'Email verification failed. Please try again.',
        }
        return errorMessages[error] || 'Something went wrong. Please try signing in again.'
    })
    const [message, setMessage] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null
        const params = new URLSearchParams(window.location.search)
        const msg = params.get('message')
        if (msg === 'verified') return '✅ Email verified! Please sign in to continue.'
        if (msg === 'try_login') return 'Please sign in with your credentials to continue.'
        return null
    })
    // Pre-fill email from URL (e.g. when redirected from verify-email page)
    const prefillEmail = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('email') || ''
        : ''
    const { toast } = useToast()

    // Listen for browser close to reset loading state
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return

        const listener = Browser.addListener('browserFinished', () => {
            console.log('🔗 Browser finished/closed by user')
            // Reset loading when OAuth browser is dismissed
            // Use a longer delay to let auth-listener process the deep link + PKCE exchange
            // The auth-listener will navigate away on success, so this only fires if OAuth fails/cancelled
            setTimeout(() => {
                console.log('🔗 Browser timeout - resetting loading state')
                setIsLoading(false)
            }, 5000)
        })

        return () => {
            listener.then(handle => handle?.remove())
        }
    }, [])

    // Safety timeout: if loading persists for 20s (OAuth flow), reset it
    useEffect(() => {
        if (!isLoading) return
        const timeout = setTimeout(() => {
            console.warn('⏱️ Login page loading timeout - resetting')
            setIsLoading(false)
        }, 20000)
        return () => clearTimeout(timeout)
    }, [isLoading])

    // Check if user is already logged in — redirect to dashboard
    // On web: checks cookies (instant). On native: checks Capacitor Preferences.
    useEffect(() => {
        // Skip if URL has error/message params (user was redirected here intentionally)
        const params = new URLSearchParams(window.location.search)
        if (params.get('error') || params.get('message')) {
            setCheckingSession(false)
            return
        }

        let cancelled = false

        async function checkExistingSession() {
            const isNative = Capacitor.isNativePlatform()
            let hasStoredAuth = false

            if (isNative) {
                // On native, check Capacitor Preferences for stored session
                try {
                    const stored = await capacitorStorage.getItem('sb-raute-auth')
                    hasStoredAuth = !!stored
                    if (!hasStoredAuth) {
                        // Also check the backup key
                        const { Preferences } = await import('@capacitor/preferences')
                        const { value } = await Preferences.get({ key: 'raute-session-backup' })
                        hasStoredAuth = !!value
                    }
                } catch {
                    hasStoredAuth = false
                }
            } else {
                // On web, check cookies
                hasStoredAuth = document.cookie
                    .split(';')
                    .some(c => c.trim().startsWith('sb-') && c.includes('auth-token'))
            }

            if (!hasStoredAuth) {
                // No stored auth = definitely not logged in
                if (!cancelled) setCheckingSession(false)
                return
            }

            // Auth data exists — verify session and redirect
            console.log('🔐 Login page: stored auth found, checking session...')

            const timeout = setTimeout(() => {
                // If getSession() takes too long (blocked on token refresh),
                // just redirect to dashboard — the auth-check there will handle it
                if (!cancelled) {
                    console.log('🔐 Login page: session check timeout, redirecting to dashboard')
                    router.push('/dashboard')
                }
            }, 3000)

            try {
                // Use timeout on getSession itself to avoid hanging on navigator.locks
                const { data } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<{ data: { session: null } }>((resolve) =>
                        setTimeout(() => resolve({ data: { session: null } }), 2500)
                    ),
                ])
                if (cancelled) return
                clearTimeout(timeout)

                if (data?.session) {
                    console.log('🔐 Login page: valid session found, redirecting to dashboard')
                } else {
                    console.log('🔐 Login page: stored auth exists but no session yet, redirecting to dashboard')
                }
                // Redirect regardless — auth-check on dashboard will handle token refresh
                // Use router.push (not window.location.href) to preserve Supabase session in memory
                router.push('/dashboard')
            } catch {
                if (cancelled) return
                clearTimeout(timeout)
                console.log('🔐 Login page: session check error, but stored auth exists — redirecting')
                router.push('/dashboard')
            }
        }

        checkExistingSession()

        return () => {
            cancelled = true
        }
    }, [router])

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsLoading(true)
        setApiError(null)
        setRedirectError(null)
        setMessage(null)

        const formData = new FormData(event.currentTarget)
        const email = formData.get("email") as string
        const password = formData.get("password") as string

        try {
            // 1. Only clear corrupted session data on native (where Capacitor storage can get stale)
            // On web, signInWithPassword overwrites any existing session automatically.
            // IMPORTANT: Do NOT call signOut() here — it fires a SIGNED_OUT event that causes
            // AuthCheck to re-mount the login page, which can hang the login flow.
            if (Capacitor.isNativePlatform()) {
                console.log('🧹 Clearing native auth data before login...')
                await capacitorStorage.clearAllAuthData()
                await new Promise(resolve => setTimeout(resolve, 300))
            }

            // 2. Attempt Standard Supabase Login
            console.log('🔐 Attempting login...')
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            })

            console.log('🔐 Login Response:', {
                error: authError?.message,
                hasSession: !!authData.session,
                userId: authData.session?.user?.id?.substring(0, 8)
            })

            if (authError) {
                console.error('❌ Login Error:', authError)

                // Check for specific error types
                if (authError.message.includes('Email not confirmed')) {
                    // Email exists but not verified — redirect to verify-email page
                    sessionStorage.setItem('pending_verification_email', email)
                    router.push('/verify-email')
                    return
                } else if (authError.message.includes('Invalid login credentials')) {
                    setApiError("Incorrect email or password")
                } else if (authError.message.includes('string did not match') ||
                           authError.message.includes('pattern')) {
                    // Session validation error - clear all auth data and retry
                    console.warn('⚠️ Session validation error detected, clearing storage...')
                    try {
                        const { capacitorStorage } = await import('@/lib/capacitor-storage')
                        await capacitorStorage.clearAllAuthData()
                        setApiError("Please try logging in again")
                    } catch {
                        setApiError("Authentication error. Please restart the app.")
                    }
                } else {
                    setApiError(authError.message || "Login failed")
                }
                throw authError
            }

            if (!authData.session) {
                throw new Error('Login succeeded but no session was created.')
            }

            // 3. Validate session data before proceeding
            const session = authData.session
            if (!session.access_token || !session.user) {
                console.error('❌ Invalid session data received')
                throw new Error('Invalid session data')
            }

            console.log('✅ Session created successfully')

            // 4. Wait a bit for session to be persisted (especially on iOS)
            await new Promise(resolve => setTimeout(resolve, 500))

            // 5. Verify session was actually saved
            const { data: savedSession } = await supabase.auth.getSession()
            if (!savedSession.session) {
                console.error('❌ Session was not persisted to storage!')
                throw new Error('Failed to save session. Please try again.')
            }

            console.log('✅ Session persisted successfully')

            // 6. Check Email Verification
            const isEmailVerified = authData.session.user.email_confirmed_at

            // 7. Handle Redirection
            if (!isEmailVerified) {
                console.log('📧 Email NOT verified - redirecting to /verify-email')
                router.push('/verify-email')
                return
            }

            // Success - redirect to dashboard
            console.log('✅ Email verified - redirecting to /dashboard')
            router.push('/dashboard')

        } catch (err: any) {
            console.error('❌ Login failed:', err)
            toast({
                title: "Login Failed",
                description: err.message || "Invalid credentials",
                type: "error"
            })
            setIsLoading(false) // Only reset on error
        }
    }

    // Show skeleton while checking for existing session or during login
    if (checkingSession || isLoading) {
        return <AuthSkeleton />
    }

    return (
        <MobileAuthWrapper
            // Web version: Full layout with navbar and footer
            children={
                <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
                    {/* Navbar */}
                    <Navbar />

                    {/* Main Content */}
                    <main className="flex-grow flex items-center justify-center px-4 pt-24 pb-12 relative overflow-hidden">
                        {/* Background Blobs */}
                        <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] bg-blue-100/50 dark:bg-blue-900/10 rounded-full blur-[100px] pointer-events-none" />
                        <div className="absolute bottom-[20%] left-[10%] w-[300px] h-[300px] bg-indigo-100/50 dark:bg-indigo-900/10 rounded-full blur-[80px] pointer-events-none" />

                        <div className="w-full max-w-md space-y-8 relative z-10">
                            <div className="text-center space-y-2">
                                <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-white dark:bg-slate-800 shadow-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
                                    <img
                                        src="/logo.png"
                                        alt="Raute Logo"
                                        className="h-14 w-14 object-contain"
                                    />
                                </div>
                                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome Back</h1>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to your Raute account to continue</p>
                            </div>

                            <Card className="border-0 shadow-xl sm:border sm:shadow-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-800">
                                <CardHeader className="space-y-1 pb-4">
                                    <CardTitle className="text-xl text-center">Sign in</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={onSubmit} className="space-y-4">
                                        {apiError && (
                                            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4" />
                                                {apiError}
                                            </div>
                                        )}
                                        {redirectError && (
                                            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4" />
                                                {redirectError}
                                            </div>
                                        )}
                                        {message && (
                                            <div className="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm p-3 rounded-md flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
                                                <CheckCircle2 className="h-4 w-4" />
                                                {message}
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium leading-none" htmlFor="email">
                                                Email
                                            </label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                                <Input
                                                    id="email"
                                                    name="email"
                                                    placeholder="name@example.com"
                                                    type="email"
                                                    autoCapitalize="none"
                                                    autoComplete="email"
                                                    autoCorrect="off"
                                                    defaultValue={prefillEmail}
                                                    className="pl-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                    disabled={isLoading}
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-medium leading-none" htmlFor="password">
                                                    Password
                                                </label>
                                                <Link
                                                    href="/update-password"
                                                    className="text-sm font-medium text-blue-600 hover:text-blue-500 hover:underline"
                                                    tabIndex={-1}
                                                >
                                                    Forgot password?
                                                </Link>
                                            </div>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                                <Input
                                                    id="password"
                                                    name="password"
                                                    placeholder="••••••••"
                                                    type={showPassword ? "text" : "password"}
                                                    autoCapitalize="none"
                                                    autoComplete="current-password"
                                                    className="pl-9 pr-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                    disabled={isLoading}
                                                    required
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute right-0 top-0 h-11 w-11 px-3 py-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    tabIndex={-1}
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                    <span className="sr-only">Toggle password visibility</span>
                                                </Button>
                                            </div>
                                        </div>

                                        <Button className="w-full h-11 text-base font-semibold shadow-lg shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 text-white" type="submit" disabled={isLoading}>
                                            {isLoading ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                    Signing in...
                                                </div>
                                            ) : (
                                                "Sign In"
                                            )}
                                        </Button>

                                        {/* OAuth Divider */}
                                        <div className="relative my-4">
                                            <div className="absolute inset-0 flex items-center">
                                                <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                                            </div>
                                            <div className="relative flex justify-center text-xs uppercase">
                                                <span className="bg-white/80 dark:bg-slate-900 px-2 text-slate-500 dark:text-slate-400 rounded-full">Or continue with</span>
                                            </div>
                                        </div>

                                        {/* OAuth Buttons */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full h-11 bg-white/50 dark:bg-slate-950/50"
                                                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                                onContextMenu={(e) => e.preventDefault()}
                                                onClick={async () => {
                                                    setIsLoading(true)
                                                    try {
                                                        const isNative = Capacitor.isNativePlatform()

                                                        // Clear ALL stale auth data before starting OAuth
                                                        // This prevents poisoned state from a previous failed attempt
                                                        if (isNative) {
                                                            console.log('🧹 Clearing stale auth data before OAuth...')
                                                            await supabase.auth.signOut({ scope: 'local' })
                                                            await capacitorStorage.clearAllAuthData()
                                                            await new Promise(resolve => setTimeout(resolve, 300))
                                                        }

                                                        const redirectUrl = isNative
                                                            ? 'io.raute.app://auth/callback'
                                                            : `${window.location.origin}/auth/callback`

                                                        const { data, error } = await supabase.auth.signInWithOAuth({
                                                            provider: 'apple',
                                                            options: {
                                                                redirectTo: redirectUrl,
                                                                skipBrowserRedirect: isNative
                                                            }
                                                        })
                                                        if (error) throw error

                                                        // Open in-app browser on mobile
                                                        if (isNative && data?.url) {
                                                            await backupCodeVerifier()
                                                            await Browser.open({ url: data.url })
                                                        }
                                                    } catch (err: any) {
                                                        toast({
                                                            title: "Sign in failed",
                                                            description: err.message,
                                                            type: "error"
                                                        })
                                                        setIsLoading(false)
                                                    }
                                                }}
                                                disabled={isLoading}
                                            >
                                                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                                                </svg>
                                                Apple
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full h-11 bg-white/50 dark:bg-slate-950/50"
                                                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                                onContextMenu={(e) => e.preventDefault()}
                                                onClick={async () => {
                                                    setIsLoading(true)
                                                    try {
                                                        const isNative = Capacitor.isNativePlatform()

                                                        // Clear ALL stale auth data before starting OAuth
                                                        if (isNative) {
                                                            console.log('🧹 Clearing stale auth data before OAuth...')
                                                            await supabase.auth.signOut({ scope: 'local' })
                                                            await capacitorStorage.clearAllAuthData()
                                                            await new Promise(resolve => setTimeout(resolve, 300))
                                                        }

                                                        const redirectUrl = isNative
                                                            ? 'io.raute.app://auth/callback'
                                                            : `${window.location.origin}/auth/callback`

                                                        const { data, error } = await supabase.auth.signInWithOAuth({
                                                            provider: 'google',
                                                            options: {
                                                                redirectTo: redirectUrl,
                                                                skipBrowserRedirect: isNative,
                                                                queryParams: {
                                                                    prompt: 'select_account'
                                                                }
                                                            }
                                                        })
                                                        if (error) throw error

                                                        // Open in-app browser on mobile
                                                        if (isNative && data?.url) {
                                                            await backupCodeVerifier()
                                                            await Browser.open({ url: data.url })
                                                        }
                                                    } catch (err: any) {
                                                        toast({
                                                            title: "Sign in failed",
                                                            description: err.message,
                                                            type: "error"
                                                        })
                                                        setIsLoading(false)
                                                    }
                                                }}
                                                disabled={isLoading}
                                            >
                                                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                </svg>
                                                Google
                                            </Button>
                                        </div>
                                    </form>
                                </CardContent>
                                <CardFooter className="flex flex-col gap-4 text-center pb-6">
                                    <div className="text-sm text-slate-500 dark:text-slate-400">
                                        Don't have an account?{" "}
                                        <Link href="/signup" className="font-semibold text-blue-600 hover:text-blue-500 hover:underline">
                                            Sign up
                                        </Link>
                                    </div>
                                </CardFooter>
                            </Card>


                        </div>
                    </main>

                    {/* Footer */}
                    <Footer />
                </div>
            }
            // Mobile version: Clean interface without navbar/footer
            mobileChildren={
                <div className="flex min-h-screen items-center justify-center px-4 bg-slate-50 dark:bg-slate-950">
                    <div className="w-full max-w-md space-y-8">
                        <div className="text-center space-y-2">
                            <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-white dark:bg-slate-800 shadow-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
                                <img
                                    src="/logo.png"
                                    alt="Raute Logo"
                                    className="h-14 w-14 object-contain"
                                />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome Back</h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to your Raute account to continue</p>
                        </div>

                        <Card className="border-0 shadow-xl sm:border sm:shadow-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-800">
                            <CardHeader className="space-y-1 pb-4">
                                <CardTitle className="text-xl text-center">Sign in</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={onSubmit} className="space-y-4">
                                    {apiError && (
                                        <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4" />
                                            {apiError}
                                        </div>
                                    )}
                                    {redirectError && (
                                        <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4" />
                                            {redirectError}
                                        </div>
                                    )}
                                    {message && (
                                        <div className="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm p-3 rounded-md flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
                                            <CheckCircle2 className="h-4 w-4" />
                                            {message}
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium leading-none" htmlFor="email">
                                            Email
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                            <Input
                                                id="email"
                                                name="email"
                                                placeholder="name@example.com"
                                                type="email"
                                                autoCapitalize="none"
                                                autoComplete="email"
                                                autoCorrect="off"
                                                defaultValue={prefillEmail}
                                                className="pl-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                disabled={isLoading}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium leading-none" htmlFor="password">
                                                Password
                                            </label>
                                            <Link
                                                href="/update-password"
                                                className="text-sm font-medium text-blue-600 hover:text-blue-500 hover:underline"
                                                tabIndex={-1}
                                            >
                                                Forgot password?
                                            </Link>
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                            <Input
                                                id="password"
                                                name="password"
                                                placeholder="••••••••"
                                                type={showPassword ? "text" : "password"}
                                                autoCapitalize="none"
                                                autoComplete="current-password"
                                                className="pl-9 pr-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                disabled={isLoading}
                                                required
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-11 w-11 px-3 py-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400"
                                                onClick={() => setShowPassword(!showPassword)}
                                                tabIndex={-1}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                                <span className="sr-only">Toggle password visibility</span>
                                            </Button>
                                        </div>
                                    </div>

                                    <Button className="w-full h-11 text-base font-semibold shadow-lg shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 text-white" type="submit" disabled={isLoading}>
                                        {isLoading ? (
                                            <div className="flex items-center gap-2">
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                Signing in...
                                            </div>
                                        ) : (
                                            "Sign In"
                                        )}
                                    </Button>

                                    {/* OAuth Divider */}
                                    <div className="relative my-4">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                                        </div>
                                        <div className="relative flex justify-center text-xs uppercase">
                                            <span className="bg-white/80 dark:bg-slate-900 px-2 text-slate-500 dark:text-slate-400 rounded-full">Or continue with</span>
                                        </div>
                                    </div>

                                    {/* OAuth Buttons */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full h-11 bg-white/50 dark:bg-slate-950/50"
                                            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                            onContextMenu={(e) => e.preventDefault()}
                                            onClick={async () => {
                                                setIsLoading(true)
                                                try {
                                                    const isNative = Capacitor.isNativePlatform()

                                                    // Clear ALL stale auth data before starting OAuth
                                                    if (isNative) {
                                                        console.log('🧹 Clearing stale auth data before OAuth...')
                                                        await supabase.auth.signOut({ scope: 'local' })
                                                        await capacitorStorage.clearAllAuthData()
                                                        await new Promise(resolve => setTimeout(resolve, 300))
                                                    }

                                                    const redirectUrl = isNative
                                                        ? 'io.raute.app://auth/callback'
                                                        : `${window.location.origin}/auth/callback`

                                                    const { data, error } = await supabase.auth.signInWithOAuth({
                                                        provider: 'apple',
                                                        options: {
                                                            redirectTo: redirectUrl,
                                                            skipBrowserRedirect: isNative
                                                        }
                                                    })
                                                    if (error) throw error

                                                    // Open in-app browser on mobile
                                                    if (isNative && data?.url) {
                                                        await backupCodeVerifier()
                                                        await Browser.open({ url: data.url })
                                                    }
                                                } catch (err: any) {
                                                    toast({
                                                        title: "Sign in failed",
                                                        description: err.message,
                                                        type: "error"
                                                    })
                                                    setIsLoading(false)
                                                }
                                            }}
                                            disabled={isLoading}
                                        >
                                            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                                            </svg>
                                            Apple
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full h-11 bg-white/50 dark:bg-slate-950/50"
                                            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                            onContextMenu={(e) => e.preventDefault()}
                                            onClick={async () => {
                                                setIsLoading(true)
                                                try {
                                                    const isNative = Capacitor.isNativePlatform()

                                                    // Clear ALL stale auth data before starting OAuth
                                                    if (isNative) {
                                                        console.log('🧹 Clearing stale auth data before OAuth...')
                                                        await supabase.auth.signOut({ scope: 'local' })
                                                        await capacitorStorage.clearAllAuthData()
                                                        await new Promise(resolve => setTimeout(resolve, 300))
                                                    }

                                                    const redirectUrl = isNative
                                                        ? 'io.raute.app://auth/callback'
                                                        : `${window.location.origin}/auth/callback`

                                                    const { data, error } = await supabase.auth.signInWithOAuth({
                                                        provider: 'google',
                                                        options: {
                                                            redirectTo: redirectUrl,
                                                            skipBrowserRedirect: isNative,
                                                            queryParams: {
                                                                prompt: 'select_account'
                                                            }
                                                        }
                                                    })
                                                    if (error) throw error

                                                    // Open in-app browser on mobile
                                                    if (isNative && data?.url) {
                                                        await backupCodeVerifier()
                                                        await Browser.open({ url: data.url })
                                                    }
                                                } catch (err: any) {
                                                    toast({
                                                        title: "Sign in failed",
                                                        description: err.message,
                                                        type: "error"
                                                    })
                                                    setIsLoading(false)
                                                }
                                            }}
                                            disabled={isLoading}
                                        >
                                            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                            </svg>
                                            Google
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                            <CardFooter className="flex flex-col gap-4 text-center pb-6">
                                <div className="text-sm text-slate-500">
                                    Don't have an account?{" "}
                                    <Link href="/signup" className="font-semibold text-blue-600 hover:text-blue-500 hover:underline">
                                        Sign up
                                    </Link>
                                </div>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            }
        />
    )
}
