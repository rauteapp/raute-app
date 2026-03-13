'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/toast-provider'
import { friendlyError } from '@/lib/friendly-error'

export default function ForgotPasswordPage() {
    const router = useRouter()
    const { toast } = useToast()

    const [email, setEmail] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [emailSent, setEmailSent] = useState(false)
    const [error, setError] = useState('')

    async function handleResetPassword(e: React.FormEvent) {
        e.preventDefault()
        setError('')

        if (!email) {
            setError('Please enter your email address')
            return
        }

        setIsLoading(true)

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'https://raute.io/update-password',
            })

            if (resetError) throw resetError

            setEmailSent(true)
            toast({
                title: 'Reset link sent!',
                description: 'Check your email for the password reset link.',
                type: 'success'
            })
        } catch (err: any) {
            setError(friendlyError(err, 'Failed to send reset link'))
            toast({
                title: 'Failed to send reset link',
                description: friendlyError(err),
                type: 'error'
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                        {emailSent ? (
                            <CheckCircle2 className="h-6 w-6 text-green-500" />
                        ) : (
                            <Mail className="h-6 w-6 text-primary" />
                        )}
                    </div>
                    <CardTitle className="text-2xl">
                        {emailSent ? 'Check Your Email' : 'Forgot Password?'}
                    </CardTitle>
                    <CardDescription>
                        {emailSent
                            ? `We sent a password reset link to ${email}`
                            : "Enter your email and we'll send you a reset link"
                        }
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {emailSent ? (
                        <div className="space-y-4">
                            <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm p-4 rounded-lg border border-green-200 dark:border-green-800">
                                <p className="font-medium mb-1">Reset link sent!</p>
                                <p className="text-xs text-green-600 dark:text-green-500">
                                    Check your inbox (and spam folder) for the password reset link.
                                </p>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                    setEmailSent(false)
                                    setEmail('')
                                }}
                            >
                                Send again
                            </Button>

                            <Button
                                variant="ghost"
                                className="w-full"
                                onClick={() => router.push('/login')}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Login
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            {error && (
                                <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="email">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-9"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isLoading || !email}
                            >
                                {isLoading ? 'Sending...' : 'Send Reset Link'}
                            </Button>

                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full"
                                onClick={() => router.push('/login')}
                            >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Login
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
