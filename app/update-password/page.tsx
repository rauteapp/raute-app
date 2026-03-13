'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Mail, Send, ArrowLeft, Clock } from 'lucide-react'
import { useToast } from '@/components/toast-provider'
import { friendlyError } from '@/lib/friendly-error'
import { markIntentionalLogout } from '@/components/auth-check'

export default function UpdatePasswordPage() {
    const router = useRouter()
    const { toast } = useToast()

    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isChecking, setIsChecking] = useState(true)
    const [error, setError] = useState('')
    const [linkExpired, setLinkExpired] = useState(false)
    const [expiredEmail, setExpiredEmail] = useState('')
    const [isResending, setIsResending] = useState(false)
    const [resendSuccess, setResendSuccess] = useState(false)

    // Track the recovery user email to display and verify
    const [recoveryEmail, setRecoveryEmail] = useState('')
    const recoveryConfirmedRef = useRef(false)

    useEffect(() => {
        // Listen for PASSWORD_RECOVERY event — this is the ONLY reliable way
        // to know a recovery link was properly processed by Supabase.
        // Without this, if User A is logged in and clicks User B's reset link,
        // getSession() might return User A's session → wrong password gets changed.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session) {
                // Recovery link was successfully verified by Supabase.
                // The session now belongs to the recovery user (not any previously logged-in user).
                recoveryConfirmedRef.current = true
                setRecoveryEmail(session.user.email || '')
                setIsChecking(false)
            }
        })

        // The Supabase client singleton may have already processed the URL hash
        // (with #access_token=...&type=recovery) BEFORE this component mounted,
        // so the PASSWORD_RECOVERY event was fired and missed. Check for this case:
        // if the URL hash contains type=recovery, the session is already established.
        const hash = window.location.hash
        if (hash.includes('type=recovery')) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session && !recoveryConfirmedRef.current) {
                    recoveryConfirmedRef.current = true
                    setRecoveryEmail(session.user.email || '')
                    setIsChecking(false)
                }
            })
        }

        // Timeout: if PASSWORD_RECOVERY doesn't fire within 8 seconds,
        // the link is expired/invalid or was already used.
        const timeout = setTimeout(() => {
            if (!recoveryConfirmedRef.current) {
                const params = new URLSearchParams(window.location.search)
                setExpiredEmail(params.get('email') || '')
                setLinkExpired(true)
                setIsChecking(false)
            }
        }, 8000)

        return () => {
            subscription.unsubscribe()
            clearTimeout(timeout)
        }
    }, [])

    async function handleResendLink() {
        if (!expiredEmail) return
        setIsResending(true)
        setError('')
        setResendSuccess(false)

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(expiredEmail, {
                redirectTo: 'https://raute.io/update-password',
            })

            if (resetError) {
                setError(friendlyError(resetError))
            } else {
                setResendSuccess(true)
            }
        } catch {
            setError('Failed to send email. Please try again.')
        } finally {
            setIsResending(false)
        }
    }

    async function handleUpdatePassword(e: React.FormEvent) {
        e.preventDefault()
        setError('')

        // Safety check: only allow password update if recovery was confirmed
        if (!recoveryConfirmedRef.current) {
            setError('Invalid recovery session. Please request a new reset link.')
            return
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters')
            return
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            return
        }

        setIsLoading(true)

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            })

            if (updateError) throw updateError

            toast({
                title: 'Password Set Successfully!',
                description: 'You can now log in with your new password.',
                type: 'success'
            })

            markIntentionalLogout()
            await supabase.auth.signOut()
            router.push('/login')

        } catch (err: any) {
            setError(friendlyError(err, 'Failed to set password'))
            toast({
                title: 'Update Failed',
                description: friendlyError(err),
                type: 'error'
            })
        } finally {
            setIsLoading(false)
        }
    }

    // === LOADING / CHECKING STATE ===
    if (isChecking) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4 safe-area-p">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center space-y-2">
                        <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2 animate-pulse">
                            <Lock className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle className="text-2xl">Verifying Link...</CardTitle>
                        <CardDescription>
                            Please wait while we verify your reset link.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        )
    }

    // === EXPIRED LINK VIEW ===
    if (linkExpired) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4 safe-area-p">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center space-y-2">
                        <div className="mx-auto w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-2">
                            <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <CardTitle className="text-2xl">Link Expired</CardTitle>
                        <CardDescription>
                            This reset link is no longer valid. Enter your email below to get a new one.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {error && (
                            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        {resendSuccess ? (
                            <div className="space-y-4">
                                <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm p-4 rounded-lg border border-green-200 dark:border-green-800">
                                    <p className="font-medium mb-1">New link sent!</p>
                                    <p className="text-xs text-green-600 dark:text-green-500">
                                        Check your inbox (and spam folder) for the new reset link.
                                    </p>
                                </div>

                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => {
                                        setResendSuccess(false)
                                    }}
                                >
                                    <Send size={16} className="mr-2" />
                                    Send again
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium" htmlFor="expired-email">
                                        Your Email Address
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="expired-email"
                                            type="email"
                                            placeholder="you@example.com"
                                            value={expiredEmail}
                                            onChange={(e) => setExpiredEmail(e.target.value)}
                                            className="pl-9"
                                            required
                                        />
                                    </div>
                                </div>

                                <Button
                                    className="w-full"
                                    onClick={handleResendLink}
                                    disabled={isResending || !expiredEmail}
                                >
                                    <Send size={16} className="mr-2" />
                                    {isResending ? 'Sending...' : 'Send New Reset Link'}
                                </Button>
                            </>
                        )}

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => router.push('/login')}
                        >
                            <ArrowLeft size={16} className="mr-2" />
                            Back to Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // === NORMAL SET PASSWORD VIEW ===
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 safe-area-p">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                        <Lock className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">Set Your Password</CardTitle>
                    <CardDescription>
                        {recoveryEmail
                            ? <>Create a new password for <strong>{recoveryEmail}</strong></>
                            : 'Create a password to access your account'
                        }
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        {error && (
                            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="password">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-9 pr-9"
                                    required
                                    minLength={8}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Must be at least 8 characters
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="confirm-password">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="confirm-password"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="pl-9 pr-9"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                                >
                                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {password.length > 0 && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                    {password.length >= 8 ? (
                                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <div className="h-3 w-3 rounded-full border-2 border-muted-foreground" />
                                    )}
                                    <span className={password.length >= 8 ? 'text-green-600' : 'text-muted-foreground'}>
                                        At least 8 characters
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    {password === confirmPassword && confirmPassword.length > 0 ? (
                                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <div className="h-3 w-3 rounded-full border-2 border-muted-foreground" />
                                    )}
                                    <span className={password === confirmPassword && confirmPassword.length > 0 ? 'text-green-600' : 'text-muted-foreground'}>
                                        Passwords match
                                    </span>
                                </div>
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading || password.length < 8 || password !== confirmPassword}
                        >
                            {isLoading ? 'Setting Password...' : 'Set Password & Continue'}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => router.push('/login')}
                        >
                            Back to Login
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
