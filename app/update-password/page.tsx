'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Mail, Send, ArrowLeft, Clock } from 'lucide-react'
import { useToast } from '@/components/toast-provider'
import { markIntentionalLogout } from '@/components/auth-check'

export default function UpdatePasswordPage() {
    const router = useRouter()
    const { toast } = useToast()

    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [linkExpired, setLinkExpired] = useState(false)
    const [expiredEmail, setExpiredEmail] = useState('')
    const [isResending, setIsResending] = useState(false)
    const [resendSuccess, setResendSuccess] = useState(false)

    // Check if we have a valid recovery session
    useEffect(() => {
        checkRecoverySession()
    }, [])

    async function checkRecoverySession() {
        let hasSession = false

        try {
            const { data: { session } } = await Promise.race([
                supabase.auth.getSession(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('getSession timeout')), 5000)
                ),
            ])
            hasSession = !!session
        } catch {
            try {
                const { data: userData } = await supabase.auth.getUser()
                hasSession = !!userData.user
            } catch {
                hasSession = false
            }
        }

        // No valid session = link expired or invalid
        if (!hasSession) {
            // Try to get email from URL params (some Supabase flows include it)
            const params = new URLSearchParams(window.location.search)
            const emailFromUrl = params.get('email') || ''
            setExpiredEmail(emailFromUrl)
            setLinkExpired(true)
        }
    }

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
                setError(resetError.message)
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
            setError(err.message || 'Failed to set password')
            toast({
                title: 'Update Failed',
                description: err.message,
                type: 'error'
            })
        } finally {
            setIsLoading(false)
        }
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
                            This setup link is no longer valid. Enter your email below to get a new one.
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
                                        Check your inbox (and spam folder) for the new setup link.
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
                                    {isResending ? 'Sending...' : 'Send New Setup Link'}
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
                        Create a password to access your account
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
