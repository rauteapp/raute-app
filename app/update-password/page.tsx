'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'
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

    // Check if we have a valid recovery session
    useEffect(() => {
        checkRecoverySession()
    }, [])

    async function checkRecoverySession() {
        let hasSession = false

        try {
            // getSession() can hang on web due to navigator.locks — add timeout
            const { data: { session } } = await Promise.race([
                supabase.auth.getSession(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('getSession timeout')), 5000)
                ),
            ])
            hasSession = !!session
        } catch {
            // getSession timed out — try getUser() as fallback
            try {
                const { data: userData } = await supabase.auth.getUser()
                hasSession = !!userData.user
            } catch {
                hasSession = false
            }
        }

        // If no session or not a recovery session, redirect to login
        if (!hasSession) {
            toast({
                title: 'Invalid Reset Link',
                description: 'Please request a new password reset link.',
                type: 'error'
            })
            router.push('/login')
        }
    }

    async function handleUpdatePassword(e: React.FormEvent) {
        e.preventDefault()
        setError('')

        // Validation
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
            // Update password using Supabase
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            })

            if (updateError) throw updateError

            toast({
                title: 'Password Updated Successfully!',
                description: 'You can now log in with your new password.',
                type: 'success'
            })

            // Sign out and redirect to login
            markIntentionalLogout()
            await supabase.auth.signOut()
            router.push('/login')

        } catch (err: any) {
            setError(err.message || 'Failed to update password')
            toast({
                title: 'Update Failed',
                description: err.message,
                type: 'error'
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 safe-area-p">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                        <Lock className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">Reset Your Password</CardTitle>
                    <CardDescription>
                        Enter your new password below
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

                        {/* New Password */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="password">
                                New Password
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

                        {/* Confirm Password */}
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

                        {/* Password Strength Indicator */}
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
                            {isLoading ? 'Updating...' : 'Update Password'}
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
