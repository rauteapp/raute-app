"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle, CheckCircle2, Eye, EyeOff, Mail } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/toast-provider"
import { MobileAuthWrapper } from "@/components/mobile-auth-wrapper"
import { AuthSkeleton } from "@/components/auth-skeleton"
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { backupCodeVerifier } from '@/lib/pkce-backup'
import { capacitorStorage } from '@/lib/capacitor-storage'
import { StyledPhoneInput } from "@/components/ui/styled-phone-input"
import { isValidPhoneNumber } from "react-phone-number-input"

const testimonials = [
    "We tried Raute because of its free trial, and everything just worked for us. There was no reason to check any other optimization tool.",
    "Raute transformed our dispatch operations completely. The routing algorithms save us hours every single day.",
    "The real-time tracking and intuitive dashboard make Raute an indispensable part of our daily logistics fleet."
];

export default function LoginPage() {
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [currentTestimonial, setCurrentTestimonial] = useState(0)
    const [checkingSession, setCheckingSession] = useState(true)
    const [apiError, setApiError] = useState<string | null>(null)
    const [showEmailForm, setShowEmailForm] = useState(false)
    const [showSignupForm, setShowSignupForm] = useState(false)
    const [signupPhoneValue, setSignupPhoneValue] = useState<string | undefined>('')
    const [signupError, setSignupError] = useState<string | null>(null)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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

    // If URL has error/message/email params, auto-show email form
    useEffect(() => {
        if (redirectError || message || prefillEmail) {
            setShowEmailForm(true)
        }
    }, [redirectError, message, prefillEmail])

    // Listen for browser close to reset loading state
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return

        const listener = Browser.addListener('browserFinished', () => {
            console.log('🔗 Browser finished/closed by user')
            setIsLoading(false)
        })

        return () => {
            listener.then(l => l.remove()).catch(console.error)
        }
    }, [])

    // Rotate testimonials
    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentTestimonial((prev) => (prev + 1) % testimonials.length)
        }, 5000)
        return () => clearTimeout(timer)
    }, [currentTestimonial])
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
                // If getSession() takes too long, show login form instead of
                // blindly redirecting to dashboard (which causes infinite loading)
                if (!cancelled) {
                    console.log('🔐 Login page: session check timeout — showing login form')
                    setCheckingSession(false)
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
                    router.push('/dashboard')
                } else {
                    // No valid session despite cookies existing — show login form
                    // Cookies may be stale/expired fragments
                    console.log('🔐 Login page: stored auth cookies found but no valid session — showing login form')
                    if (!cancelled) setCheckingSession(false)
                }
            } catch {
                if (cancelled) return
                clearTimeout(timeout)
                console.log('🔐 Login page: session check failed — showing login form')
                if (!cancelled) setCheckingSession(false)
            }
        }

        checkExistingSession()

        return () => {
            cancelled = true
        }
    }, [router])

    // --- OAuth Handlers (shared between mobile landing & forms) ---

    async function handleGoogleSignIn() {
        setIsLoading(true)
        try {
            const isNative = typeof window !== 'undefined' && (window as unknown as { Capacitor?: any }).Capacitor?.isNativePlatform()
            const { capacitorStorage } = await import('@/lib/capacitor-storage')
            const { Browser } = await import('@capacitor/browser')
            const { backupCodeVerifier } = await import('@/lib/pkce-backup')

            if (isNative) {
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
                    queryParams: { prompt: 'select_account' }
                }
            })
            if (error) throw error

            if (isNative && data?.url) {
                await backupCodeVerifier()
                await Browser.open({ url: data.url })
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            setApiError(errorMsg)
            setIsLoading(false)
        }
    }

    async function handleAppleSignIn() {
        setIsLoading(true)
        try {
            const isNative = typeof window !== 'undefined' && (window as unknown as { Capacitor?: any }).Capacitor?.isNativePlatform()
            const { capacitorStorage } = await import('@/lib/capacitor-storage')
            const { Browser } = await import('@capacitor/browser')
            const { backupCodeVerifier } = await import('@/lib/pkce-backup')

            if (isNative) {
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
                    skipBrowserRedirect: isNative,
                }
            })
            if (error) throw error

            if (isNative && data?.url) {
                await backupCodeVerifier()
                await Browser.open({ url: data.url })
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            setApiError(errorMsg)
            setIsLoading(false)
        }
    }

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

    async function onSignupSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsLoading(true)
        setSignupError(null)

        const formData = new FormData(event.currentTarget)
        const fullName = formData.get("full_name") as string
        const companyName = formData.get("company_name") as string
        const email = formData.get("email") as string
        const phone = signupPhoneValue || formData.get("phone") as string
        const password = formData.get("password") as string
        const confirmPassword = formData.get("confirm_password") as string

        // Validation
        if (password !== confirmPassword) {
            setSignupError("Passwords do not match.")
            setIsLoading(false)
            return
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            setSignupError("Invalid email format.")
            setIsLoading(false)
            return
        }

        if (phone && !isValidPhoneNumber(phone)) {
            setSignupError("Invalid phone number. Please verify the country code.")
            setIsLoading(false)
            return
        }

        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                    data: {
                        full_name: fullName,
                        phone: phone
                    }
                }
            })

            if (authError) throw authError
            if (!authData.user) throw new Error("No user returned from signup")

            if (authData.user.identities && authData.user.identities.length === 0) {
                setSignupError("An account with this email already exists. Please sign in instead.")
                setIsLoading(false)
                return
            }

            try {
                const { data: rpcData, error: rpcError } = await Promise.race([
                    supabase.rpc('complete_manager_signup', {
                        user_email: email,
                        company_name: companyName,
                        full_name: fullName,
                        user_password: password,
                        user_phone: phone
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('RPC timeout - profile might still be creating')), 10000)
                    )
                ]) as any

                if (rpcError) {
                    console.warn("RPC Error (non-fatal):", rpcError.message)
                }

                if (rpcData && !rpcData.success) {
                    console.warn("RPC returned error:", rpcData.error)
                }
            } catch (rpcErr: any) {
                console.warn("RPC failed:", rpcErr.message)
            }

            sessionStorage.setItem('pending_verification_email', email)
            router.push("/verify-email")

        } catch (err: any) {
            toast({
                title: "Signup Failed",
                description: err.message || "An unexpected error occurred",
                type: "error"
            })
            setSignupError(err instanceof Error ? err.message : "An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    // Show skeleton while checking for existing session or during login
    if (checkingSession || isLoading) {
        return <AuthSkeleton />
    }

    return (
        <MobileAuthWrapper
            mobileChildren={
                    // ─── Spoke-style Landing View ───
                    <div className="flex flex-col h-screen relative overflow-hidden">
                        {/* Background — route map hero image */}
                        <div className="absolute inset-0">
                            <img
                                src="/login-hero-map.png"
                                alt="Route Map"
                                className="w-full h-full object-cover object-top"
                            />
                        </div>

                        {/* Content overlay */}
                        <div className="relative z-10 flex flex-col h-full safe-area-p overflow-hidden">
                            {/* Top spacer */}
                            <div className="pt-20" />

                            {/* Spacer */}
                            <div className="flex-1" />

                            {/* Bottom section */}
                            <div className="px-6 pb-8 space-y-3">
                                {!showSignupForm ? (
                                    <>
                                        {/* All-in-one login card */}
                                        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 space-y-3" style={{ boxShadow: '0 4px 24px -4px rgba(0,0,0,0.12), 0 8px 32px -8px rgba(0,0,0,0.08)' }}>
                                            <form onSubmit={onSubmit} className="space-y-3">
                                                {apiError && (
                                                    <div className="bg-destructive/15 text-destructive text-sm p-2.5 rounded-lg flex items-center gap-2">
                                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                                        {apiError}
                                                    </div>
                                                )}
                                                {redirectError && (
                                                    <div className="bg-destructive/15 text-destructive text-sm p-2.5 rounded-lg flex items-center gap-2">
                                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                                        {redirectError}
                                                    </div>
                                                )}
                                                {message && (
                                                    <div className="bg-emerald-50 text-emerald-600 text-sm p-2.5 rounded-lg flex items-center gap-2 border border-emerald-200">
                                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                        {message}
                                                    </div>
                                                )}

                                                <div>
                                                    <Input
                                                        id="email-landing"
                                                        name="email"
                                                        placeholder="Work email"
                                                        type="email"
                                                        autoCapitalize="none"
                                                        autoComplete="email"
                                                        autoCorrect="off"
                                                        defaultValue={prefillEmail}
                                                        className="h-12 bg-white border-slate-300 rounded-xl focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px]"
                                                        disabled={isLoading}
                                                        required
                                                    />
                                                </div>

                                                <div className="relative">
                                                    <Input
                                                        id="password-landing"
                                                        name="password"
                                                        placeholder="Password"
                                                        type={showPassword ? "text" : "password"}
                                                        autoCapitalize="none"
                                                        autoComplete="current-password"
                                                        className="pr-10 h-12 bg-white border-slate-300 rounded-xl focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px]"
                                                        disabled={isLoading}
                                                        required
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="absolute right-0 top-0 h-12 w-12 px-3 py-2 text-slate-400 hover:text-slate-600"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        tabIndex={-1}
                                                    >
                                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </Button>
                                                </div>

                                                <Button className="w-full h-12 text-[15px] font-semibold rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-none" type="submit" disabled={isLoading}>
                                                    {isLoading ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                            Logging in...
                                                        </div>
                                                    ) : (
                                                        "Log in"
                                                    )}
                                                </Button>
                                            </form>

                                            {/* Divider */}
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-[1px] bg-slate-200"></div>
                                                <span className="text-[12px] font-medium text-slate-400">or</span>
                                                <div className="flex-1 h-[1px] bg-slate-200"></div>
                                            </div>

                                            {/* Continue with Google */}
                                            <button
                                                type="button"
                                                onClick={handleGoogleSignIn}
                                                disabled={isLoading}
                                                className="w-full h-[48px] bg-white rounded-xl flex items-center justify-center gap-3 border border-slate-200 active:scale-[0.98] transition-all"
                                                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                            >
                                                <svg className="h-5 w-5" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                </svg>
                                                <span className="text-[15px] font-semibold text-slate-700">Continue with Google</span>
                                            </button>

                                            {/* Continue with Apple */}
                                            <button
                                                type="button"
                                                onClick={handleAppleSignIn}
                                                disabled={isLoading}
                                                className="w-full h-[48px] bg-white rounded-xl flex items-center justify-center gap-3 border border-slate-200 active:scale-[0.98] transition-all"
                                                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                            >
                                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                                                </svg>
                                                <span className="text-[15px] font-semibold text-slate-700">Continue with Apple</span>
                                            </button>

                                            {/* Create account link */}
                                            <div className="text-center pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowSignupForm(true); setApiError(null); }}
                                                    className="text-[14px] font-semibold text-blue-600"
                                                >
                                                    Create account
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Signup Form — inline */}
                                        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 max-h-[70vh] overflow-y-auto" style={{ boxShadow: '0 4px 24px -4px rgba(0,0,0,0.12), 0 8px 32px -8px rgba(0,0,0,0.08)' }}>
                                            <h3 className="text-[17px] font-semibold text-slate-800 mb-4">Create account</h3>
                                            <form onSubmit={onSignupSubmit} className="space-y-3">
                                                {signupError && (
                                                    <div className="bg-destructive/15 text-destructive text-sm p-2.5 rounded-lg flex items-center gap-2">
                                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                                        {signupError}
                                                    </div>
                                                )}

                                                {/* Full Name & Company side by side */}
                                                <div className="grid gap-3 grid-cols-2">
                                                    <div>
                                                        <Input
                                                            id="signup-full_name"
                                                            name="full_name"
                                                            placeholder="Full name"
                                                            type="text"
                                                            className="h-12 bg-white border-slate-300 rounded-xl focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px]"
                                                            disabled={isLoading}
                                                            required
                                                        />
                                                    </div>
                                                    <div>
                                                        <Input
                                                            id="signup-company_name"
                                                            name="company_name"
                                                            placeholder="Company"
                                                            type="text"
                                                            className="h-12 bg-white border-slate-300 rounded-xl focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px]"
                                                            disabled={isLoading}
                                                            required
                                                        />
                                                    </div>
                                                </div>

                                                {/* Phone */}
                                                <div>
                                                    <StyledPhoneInput
                                                        name="phone"
                                                        value={signupPhoneValue}
                                                        onChange={setSignupPhoneValue}
                                                        placeholder="Phone number"
                                                        className="h-12 bg-white border-slate-300 rounded-xl"
                                                        required
                                                    />
                                                </div>

                                                {/* Email */}
                                                <div>
                                                    <Input
                                                        id="signup-email"
                                                        name="email"
                                                        placeholder="Work email"
                                                        type="email"
                                                        autoCapitalize="none"
                                                        autoComplete="email"
                                                        autoCorrect="off"
                                                        className="h-12 bg-white border-slate-300 rounded-xl focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px]"
                                                        disabled={isLoading}
                                                        required
                                                    />
                                                </div>

                                                {/* Password */}
                                                <div className="relative">
                                                    <Input
                                                        id="signup-password"
                                                        name="password"
                                                        placeholder="Password (min. 8 chars)"
                                                        type={showConfirmPassword ? "text" : "password"}
                                                        autoCapitalize="none"
                                                        autoComplete="new-password"
                                                        className="pr-10 h-12 bg-white border-slate-300 rounded-xl focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px]"
                                                        disabled={isLoading}
                                                        required
                                                        minLength={8}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="absolute right-0 top-0 h-12 w-12 px-3 py-2 text-slate-400 hover:text-slate-600"
                                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                        tabIndex={-1}
                                                    >
                                                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </Button>
                                                </div>

                                                {/* Confirm Password */}
                                                <div className="relative">
                                                    <Input
                                                        id="signup-confirm_password"
                                                        name="confirm_password"
                                                        placeholder="Confirm password"
                                                        type={showConfirmPassword ? "text" : "password"}
                                                        autoCapitalize="none"
                                                        autoComplete="new-password"
                                                        className="pr-10 h-12 bg-white border-slate-300 rounded-xl focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px]"
                                                        disabled={isLoading}
                                                        required
                                                        minLength={8}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="absolute right-0 top-0 h-12 w-12 px-3 py-2 text-slate-400 hover:text-slate-600"
                                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                        tabIndex={-1}
                                                    >
                                                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </Button>
                                                </div>

                                                <Button className="w-full h-12 text-[15px] font-semibold rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-none" type="submit" disabled={isLoading}>
                                                    {isLoading ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                            Creating account...
                                                        </div>
                                                    ) : (
                                                        "Create account"
                                                    )}
                                                </Button>
                                            </form>

                                            <div className="flex items-center justify-center mt-4 pt-3 border-t border-slate-100">
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowSignupForm(false); setSignupError(null); }}
                                                    className="text-[13px] font-semibold text-blue-600 flex items-center gap-1"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                                    Back to login
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Terms */}
                                <p className="text-center text-[11px] text-slate-400 pt-1 leading-relaxed">
                                    By continuing, you agree to Raute&apos;s{" "}
                                    <Link href="/privacy" className="font-medium text-slate-500 underline">privacy policy</Link>
                                    {" "}and{" "}
                                    <Link href="/terms" className="font-medium text-slate-500 underline">terms of use</Link>
                                </p>
                            </div>
                        </div>
                    </div>
            }
        >
            <div className="flex min-h-screen bg-white text-slate-900">
                {/* Main Content */}
                <main className="flex w-full items-stretch relative">
                    {/* Left Column - Form */}
                    <div className="w-full lg:w-[45%] flex flex-col justify-center items-center py-8 relative z-10 w-full lg:max-w-xl mx-auto">
                        <div className="w-full max-w-[380px] px-4 space-y-6">
                            <div className="text-center space-y-3">
                                <div className="inline-flex items-center justify-center mx-auto mb-2">
                                    <img src="/logo.png" alt="Raute" className="h-[48px] w-auto object-contain" />
                                </div>
                                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
                                <p className="text-[15px] text-slate-500">Log in to Raute Dispatch</p>
                            </div>

                            <div className="mt-8">
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

                                    <div className="space-y-1.5 text-left">
                                        <label className="text-sm font-medium leading-none text-slate-700 mb-2 block" htmlFor="email">
                                            Work email*
                                        </label>
                                        <div className="relative">
                                            <Input
                                                id="email"
                                                name="email"
                                                placeholder="Enter your work email"
                                                type="email"
                                                autoCapitalize="none"
                                                autoComplete="email"
                                                autoCorrect="off"
                                                defaultValue={prefillEmail}
                                                className="h-11 bg-white border-slate-300 rounded-lg focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px] px-3 shadow-none w-full"
                                                disabled={isLoading}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 text-left">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium leading-none text-slate-700" htmlFor="password">
                                                Password*
                                            </label>
                                            <Link
                                                href="/forgot-password"
                                                className="text-[13px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                                                tabIndex={-1}
                                            >
                                                Forgot password?
                                            </Link>
                                        </div>
                                        <div className="relative">
                                            <Input
                                                id="password"
                                                name="password"
                                                placeholder="Enter your password"
                                                type={showPassword ? "text" : "password"}
                                                autoCapitalize="none"
                                                autoComplete="current-password"
                                                className="pr-10 h-11 bg-white border-slate-300 rounded-lg focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px] shadow-none w-full"
                                                disabled={isLoading}
                                                required
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-11 w-11 px-3 py-2 text-slate-400 hover:text-slate-600"
                                                onClick={() => setShowPassword(!showPassword)}
                                                tabIndex={-1}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                <span className="sr-only">Toggle password visibility</span>
                                            </Button>
                                        </div>
                                    </div>

                                    <Button className="w-full h-11 mt-2 text-[15px] font-medium rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white transition-colors shadow-none" type="submit" disabled={isLoading}>
                                        {isLoading ? (
                                            <div className="flex items-center gap-2">
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                Logging in...
                                            </div>
                                        ) : (
                                            "Log in"
                                        )}
                                    </Button>

                                    <div className="pt-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full h-11 text-[15px] font-medium bg-white border-slate-200 shadow-sm rounded-lg hover:bg-slate-50 text-slate-700 gap-2"
                                            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                            onContextMenu={(e) => e.preventDefault()}
                                            onClick={handleGoogleSignIn}
                                            disabled={isLoading}
                                        >
                                            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                            </svg>
                                            Log in with Google
                                        </Button>
                                    </div>

                                    <div className="mt-4 pt-4 pb-6 border-b border-[#f1f5f9] flex justify-center w-full">
                                        <button type="button" className="text-[14px] font-medium text-[#2563eb] hover:text-[#1d4ed8] inline-flex items-center">
                                            More log in options
                                            <svg className="ml-1.5 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                    </div>
                                </form>

                                <div className="mt-6 text-center space-y-4">
                                    <div className="text-[14px] text-slate-700">
                                        Don&apos;t have an account yet?{" "}
                                        <Link href="/signup" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                                            Sign up for a free trial
                                        </Link>
                                    </div>
                                    <p className="text-[13px] text-slate-400 font-medium pb-2">
                                        Delivering over 1 billion packages a year
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Divider visual element showing as custom scroll separator */}
                    <div className="hidden lg:block w-[4px] rounded-full h-[600px] mt-24 bg-slate-200"></div>

                    {/* Right Column - Promotional */}
                    <div className="hidden lg:flex w-[55%] p-3 pb-3">
                        {/* the card wrapper */}
                        <div className="w-full h-full bg-[#1c3e8e] text-white pt-16 flex-col relative overflow-hidden rounded-[1.8rem] flex justify-start items-center border-[0.5px] border-blue-900 shadow-xl shadow-[#1e40af]/10">
                            {/* Inner Content limit */}
                            <div className="relative z-10 w-full max-w-lg mt-12 flex flex-col items-center">
                                <h2 className="text-[1.8rem] tracking-tight font-medium leading-[1.4] mb-8 text-center px-4 text-white/95 min-h-[120px] transition-opacity duration-500">
                                    &quot;{testimonials[currentTestimonial]}&quot;
                                </h2>

                                {/* Carousel indicators */}
                                <div className="flex justify-center gap-2.5 mb-16">
                                    {testimonials.map((_, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => setCurrentTestimonial(idx)}
                                            className={`h-[6px] rounded-full cursor-pointer transition-all duration-300 ${currentTestimonial === idx
                                                ? "w-8 bg-white"
                                                : "w-[6px] bg-white/40 hover:bg-white/60 mt-[1px]"
                                                }`}
                                        ></div>
                                    ))}
                                </div>
                            </div>

                            {/* Product Image Container */}
                            <div className="relative w-full flex-grow flex justify-center items-end bottom-0 pointer-events-none px-4 pb-0">
                                <img
                                    src="/77c95eac-235b-4021-8988-780cfe7d26ee.png"
                                    alt="Dashboard Output"
                                    className="w-[110%] max-w-[750px] object-contain drop-shadow-2xl"
                                />
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </MobileAuthWrapper>
    )
}
