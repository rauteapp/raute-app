'use client'

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Mail, ArrowLeft, RefreshCw, AlertCircle, Send, CheckCircle2 } from "lucide-react"
import { markIntentionalLogout } from "@/components/auth-check"

/**
 * Check email verification status via Supabase RPC.
 * Calls the DB function directly — works on both web and Capacitor (no API route needed).
 */
async function checkEmailVerified(email: string): Promise<boolean> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc(
            'check_email_verification',
            { check_email: email.trim().toLowerCase() }
        )
        if (error) {
            return false
        }
        return !!data
    } catch {
        return false
    }
}

export default function VerifyEmailPage() {
    const router = useRouter()
    const [isChecking, setIsChecking] = useState(false)
    const [isResending, setIsResending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [userEmail, setUserEmail] = useState<string | null>(null)

    // On mount: get user email and auto-redirect if already verified
    useEffect(() => {
        async function checkOnMount() {
            let session: any = null

            try {
                const { data } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<{ data: { session: null } }>((resolve) =>
                        setTimeout(() => resolve({ data: { session: null } }), 3000)
                    ),
                ])
                session = data.session
            } catch {
                // getSession blocked — try getUser()
                try {
                    const { data: userData } = await supabase.auth.getUser()
                    if (userData.user) {
                        session = { user: userData.user }
                    }
                } catch {}
            }

            if (session?.user?.email) {
                setUserEmail(session.user.email)
            } else {
                // Supabase doesn't create a session until email is verified,
                // so fall back to the email saved in sessionStorage during signup
                const saved = sessionStorage.getItem('pending_verification_email')
                if (saved) setUserEmail(saved)
            }
            // If email is already verified, skip this page entirely
            if (session?.user?.email_confirmed_at) {
                window.location.href = '/dashboard'
            }
        }
        checkOnMount()
    }, [])

    async function handleCheckVerification() {
        setIsChecking(true)
        setError(null)
        setSuccess(null)

        try {
            // Cheap session check first — with timeout to avoid navigator.locks hang
            let { data: sessionData } = await Promise.race([
                supabase.auth.getSession(),
                new Promise<{ data: { session: null } }>((resolve) =>
                    setTimeout(() => resolve({ data: { session: null } }), 3000)
                ),
            ]) as any

            // If no session, try refreshing once — picks up cross-tab verification
            if (!sessionData.session) {
                try {
                    const { data: refreshed } = await supabase.auth.refreshSession()
                    if (refreshed.session) {
                        sessionData = refreshed
                    }
                } catch {}
            }

            if (sessionData.session) {
                if (sessionData.session.user.email_confirmed_at) {
                    // ✅ Verified + signed in — go to dashboard
                    sessionStorage.removeItem('pending_verification_email')
                    window.location.href = '/dashboard'
                    return
                } else {
                    // Session exists but email not yet verified
                    setError("Your email isn't verified yet. Please click the link we sent to your inbox.")
                    setIsChecking(false)
                    return
                }
            }

            // No session — check the database directly via RPC
            const email = userEmail || sessionStorage.getItem('pending_verification_email') || ''
            if (email) {
                const verified = await checkEmailVerified(email)

                if (verified) {
                    // ✅ Email is verified — redirect to login with email pre-filled
                    sessionStorage.removeItem('pending_verification_email')
                    setSuccess("Your email is verified! Redirecting to sign in...")
                    setTimeout(() => {
                        const params = new URLSearchParams()
                        params.set('message', 'verified')
                        params.set('email', email)
                        window.location.href = `/login?${params.toString()}`
                    }, 1500)
                    return
                }
            }

            // Not verified yet
            setError("Your email isn't verified yet. Please click the link we sent to your inbox.")
            setIsChecking(false)

        } catch {
            setError("Something went wrong. Please try again.")
            setIsChecking(false)
        }
    }


    async function handleResendEmail() {
        setIsResending(true)
        setError(null)
        setSuccess(null)

        try {
            // Get the email from session, state, or sessionStorage fallback
            // Use timeout to avoid navigator.locks hang
            const { data: sessionData } = await Promise.race([
                supabase.auth.getSession(),
                new Promise<{ data: { session: null } }>((resolve) =>
                    setTimeout(() => resolve({ data: { session: null } }), 3000)
                ),
            ]) as any

            // Check if already verified via session
            if (sessionData.session?.user?.email_confirmed_at) {
                sessionStorage.removeItem('pending_verification_email')
                setSuccess("Your email is already verified! Redirecting to dashboard...")
                setTimeout(() => { window.location.href = '/dashboard' }, 1500)
                return
            }

            let email = userEmail
            if (!email) {
                email = sessionData.session?.user?.email || null
                if (!email) {
                    email = sessionStorage.getItem('pending_verification_email')
                }
                if (email) setUserEmail(email)
            }

            if (!email) {
                setError("No email found. Please go back to login and try again.")
                setIsResending(false)
                return
            }

            // No session — check database directly via RPC
            if (!sessionData.session) {
                const verified = await checkEmailVerified(email)

                if (verified) {
                    sessionStorage.removeItem('pending_verification_email')
                    setSuccess("Your email is already verified! Please sign in to continue.")
                    setIsResending(false)
                    return
                }
            }

            const { error: resendError } = await supabase.auth.resend({
                type: 'signup',
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`
                }
            })

            if (resendError) {
                // Handle rate limiting
                if (resendError.message.includes('rate') || resendError.message.includes('limit') || resendError.status === 429) {
                    setError("Please wait a moment before requesting another email.")
                } else {
                    setError(resendError.message)
                }
            } else {
                setSuccess("Verification email sent! Please check your inbox (and spam folder).")
            }
        } catch {
            setError("Failed to resend email. Please try again.")
        } finally {
            setIsResending(false)
        }
    }

    async function handleLogout() {
        markIntentionalLogout()
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 safe-area-p">
            <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl p-8 text-center space-y-6">
                <div className="mx-auto w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                    <Mail size={32} />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight">Check your inbox</h1>
                    <p className="text-muted-foreground">
                        We sent a verification link to{' '}
                        {userEmail ? <strong>{userEmail}</strong> : 'your email'}. <br />
                        Please click the link to confirm your account.
                    </p>
                </div>

                {error && (
                    <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2 text-left">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {success && (
                    <div className="bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400 text-sm p-3 rounded-md flex items-center gap-2 text-left">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                        {success}
                    </div>
                )}

                <div className="flex flex-col gap-3 pt-4">
                    <Button
                        variant="outline"
                        onClick={handleCheckVerification}
                        disabled={isChecking || isResending}
                        className="h-12 border-primary/20 text-primary hover:bg-primary/5"
                    >
                        <RefreshCw size={16} className={`mr-2 ${isChecking ? 'animate-spin' : ''}`} />
                        {isChecking ? "Checking..." : "I've verified my email"}
                    </Button>

                    <Button
                        variant="outline"
                        onClick={handleResendEmail}
                        disabled={isResending || isChecking}
                        className="h-12"
                    >
                        <Send size={16} className={`mr-2 ${isResending ? 'animate-pulse' : ''}`} />
                        {isResending ? "Sending..." : "Resend verification email"}
                    </Button>

                    <Button variant="ghost" onClick={handleLogout} className="h-12">
                        <ArrowLeft size={16} className="mr-2" />
                        Back to Login
                    </Button>
                </div>
            </div>
        </div>
    )
}
