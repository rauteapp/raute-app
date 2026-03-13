'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Mail, Send, ArrowLeft, Clock, Truck, Radio } from 'lucide-react'
import { friendlyError } from '@/lib/friendly-error'
import { useToast } from '@/components/toast-provider'
import { markIntentionalLogout } from '@/components/auth-check'

export default function WelcomeSetupPage() {
    const router = useRouter()
    const { toast } = useToast()

    // Page state
    const [isLoading, setIsLoading] = useState(true)
    const [linkExpired, setLinkExpired] = useState(false)
    const [setupComplete, setSetupComplete] = useState(false)

    // User context
    const [userName, setUserName] = useState('')
    const [userEmail, setUserEmail] = useState('')
    const [userRole, setUserRole] = useState<'driver' | 'dispatcher'>('driver')
    const [companyName, setCompanyName] = useState('')
    const [managerName, setManagerName] = useState('')

    // Form state
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    // Expired link state
    const [expiredEmail, setExpiredEmail] = useState('')
    const [isResending, setIsResending] = useState(false)
    const [resendSuccess, setResendSuccess] = useState(false)

    // Track that PASSWORD_RECOVERY event fired — this is the ONLY reliable way
    // to know the recovery link was properly processed and the session belongs
    // to the correct user (not a previously logged-in user).
    const recoveryConfirmedRef = useRef(false)

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session) {
                // Direct recovery event — ideal case
                recoveryConfirmedRef.current = true
                loadWelcomeData(session.user.id)
            } else if (event === 'INITIAL_SESSION' && session && !recoveryConfirmedRef.current) {
                // The Supabase client singleton processes the URL hash (#access_token=...&type=recovery)
                // and fires PASSWORD_RECOVERY BEFORE React mounts. By the time this listener is
                // registered, the event is missed and the hash is cleared. However, onAuthStateChange
                // always fires INITIAL_SESSION immediately with the current session — which IS the
                // recovery session (Supabase replaced any previous session when it processed the hash).
                recoveryConfirmedRef.current = true
                loadWelcomeData(session.user.id)
            }
        })

        // Timeout: if neither event provides a session within 8 seconds,
        // the link is expired/invalid or was already used.
        const timeout = setTimeout(() => {
            if (!recoveryConfirmedRef.current) {
                const params = new URLSearchParams(window.location.search)
                setExpiredEmail(params.get('email') || '')
                setLinkExpired(true)
                setIsLoading(false)
            }
        }, 8000)

        return () => {
            subscription.unsubscribe()
            clearTimeout(timeout)
        }
    }, [])

    async function loadWelcomeData(userId: string) {
        try {
            // Get user metadata (has created_by_name from the send-welcome API)
            const { data: { user } } = await supabase.auth.getUser()
            const meta = user?.user_metadata || {}

            setUserEmail(user?.email || '')
            setManagerName(meta.created_by_name || '')
            setUserName(meta.full_name || '')
            setUserRole(meta.role === 'dispatcher' ? 'dispatcher' : 'driver')

            // Try to fetch profile + company from database (may fail with RLS for new users)
            const { data: profile } = await supabase
                .from('users')
                .select('full_name, role, company_id')
                .eq('id', userId)
                .single()

            if (profile) {
                setUserName(profile.full_name || meta.full_name || '')
                setUserRole(profile.role === 'dispatcher' ? 'dispatcher' : 'driver')

                if (profile.company_id) {
                    const { data: company } = await supabase
                        .from('companies')
                        .select('name')
                        .eq('id', profile.company_id)
                        .single()
                    if (company?.name) setCompanyName(company.name)
                }
            }
        } catch (err) {
            // Profile query may fail for new users — metadata fallback is already set above
            console.error('Failed to load welcome data:', err)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleSetPassword(e: React.FormEvent) {
        e.preventDefault()
        setError('')

        // Safety check: only allow password update if recovery was confirmed
        if (!recoveryConfirmedRef.current) {
            setError('Invalid recovery session. Please request a new setup link.')
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

        setIsSubmitting(true)

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            })

            if (updateError) throw updateError

            setSetupComplete(true)

            // Brief delay to show success state, then sign out and redirect to login
            setTimeout(async () => {
                markIntentionalLogout()
                await supabase.auth.signOut()
                router.push('/login')
            }, 2500)

        } catch (err: any) {
            setError(friendlyError(err, 'Failed to set password'))
            toast({
                title: 'Setup Failed',
                description: friendlyError(err),
                type: 'error'
            })
        } finally {
            setIsSubmitting(false)
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

    const displayRole = userRole === 'dispatcher' ? 'Dispatcher' : 'Driver'
    const RoleIcon = userRole === 'dispatcher' ? Radio : Truck

    // === LOADING STATE ===
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
                <div className="animate-pulse space-y-4 w-full max-w-md">
                    <div className="h-32 bg-blue-200/30 dark:bg-blue-900/20 rounded-t-2xl" />
                    <div className="space-y-3 p-6">
                        <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded mt-6" />
                        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded" />
                    </div>
                </div>
            </div>
        )
    }

    // === SUCCESS STATE ===
    if (setupComplete) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden text-center p-8">
                    <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4 animate-in zoom-in-50 duration-300">
                        <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        You&apos;re All Set!
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-2">
                        Your password has been created successfully.
                    </p>
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                        Redirecting you to login...
                    </p>
                </div>
            </div>
        )
    }

    // === EXPIRED LINK VIEW ===
    if (linkExpired) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4 safe-area-p">
                <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-8 text-center space-y-2">
                        <div className="mx-auto w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-2">
                            <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Link Expired</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                            This setup link is no longer valid. Enter your email below to get a new one.
                        </p>
                    </div>

                    <div className="px-8 pb-8 space-y-4">
                        {error && (
                            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-lg flex items-center gap-2">
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
                                    onClick={() => setResendSuccess(false)}
                                >
                                    <Send size={16} className="mr-2" />
                                    Send again
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="expired-email">
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
                    </div>
                </div>
            </div>
        )
    }

    // === MAIN WELCOME + PASSWORD SETUP VIEW ===
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4 safe-area-p">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden">
                {/* Branded Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-10 text-center">
                    <h1 className="text-white text-2xl font-bold tracking-tight mb-1">RAUTE</h1>
                    <p className="text-blue-200 text-sm">Smart Delivery Management</p>
                </div>

                {/* Welcome Section */}
                <div className="px-8 pt-8 pb-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                            <RoleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                Welcome{userName ? `, ${userName}` : ''}!
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {managerName ? (
                                    <><strong>{managerName}</strong> added you as a <strong>{displayRole}</strong>{companyName ? <> to <strong>{companyName}</strong></> : ''}</>
                                ) : (
                                    <>You&apos;ve been added as a <strong>{displayRole}</strong>{companyName ? <> to <strong>{companyName}</strong></> : ''}</>
                                )}
                            </p>
                            {userEmail && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
                                    <Mail size={12} />
                                    {userEmail}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Quick Steps */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mb-6">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Getting Started</p>
                        <div className="space-y-2.5">
                            <div className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Set your password below</p>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Log in at <strong>raute.io</strong> or the Raute app</p>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                    {userRole === 'dispatcher'
                                        ? 'Start managing and assigning deliveries'
                                        : 'Start viewing and completing your deliveries'
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Password Form */}
                <div className="px-8 pb-8">
                    <form onSubmit={handleSetPassword} className="space-y-4">
                        {error && (
                            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-lg flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">
                                Create Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="At least 8 characters"
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
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="confirm-password">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="confirm-password"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    placeholder="Re-enter your password"
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

                        {/* Password validation indicators */}
                        {password.length > 0 && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                    {password.length >= 8 ? (
                                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <div className="h-3 w-3 rounded-full border-2 border-muted-foreground" />
                                    )}
                                    <span className={password.length >= 8 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                                        At least 8 characters
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    {password === confirmPassword && confirmPassword.length > 0 ? (
                                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    ) : (
                                        <div className="h-3 w-3 rounded-full border-2 border-muted-foreground" />
                                    )}
                                    <span className={password === confirmPassword && confirmPassword.length > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                                        Passwords match
                                    </span>
                                </div>
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-5"
                            disabled={isSubmitting || password.length < 8 || password !== confirmPassword}
                        >
                            {isSubmitting ? 'Setting up...' : 'Set Password & Get Started'}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    )
}
