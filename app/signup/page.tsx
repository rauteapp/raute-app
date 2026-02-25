"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Eye, EyeOff, Lock, Mail, User, AlertCircle } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/toast-provider"
import { StyledPhoneInput } from "@/components/ui/styled-phone-input"
import { isValidPhoneNumber } from "react-phone-number-input"
import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"
import { MobileAuthWrapper } from "@/components/mobile-auth-wrapper"
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

export default function SignupPage() {
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [phoneValue, setPhoneValue] = useState<string | undefined>('')
    const { toast } = useToast()

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsLoading(true)
        setError(null)

        const formData = new FormData(event.currentTarget)
        const fullName = formData.get("full_name") as string
        const companyName = formData.get("company_name") as string
        const email = formData.get("email") as string
        const phone = phoneValue || formData.get("phone") as string
        const password = formData.get("password") as string
        const confirmPassword = formData.get("confirm_password") as string

        // Validation
        if (password !== confirmPassword) {
            setError("Passwords do not match.")
            setIsLoading(false)
            return
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            setError("Invalid email format.")
            setIsLoading(false)
            return
        }

        if (phone && !isValidPhoneNumber(phone)) {
            setError("Invalid phone number. Please verify the country code.")
            setIsLoading(false)
            return
        }

        try {
            // 1. Sign up the user
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

            if (authError) {
                throw authError
            }
            if (!authData.user) throw new Error("No user returned from signup")

            // Check for duplicate signup — Supabase returns user with empty identities
            // when the email is already registered (security: no confirmation email sent)
            if (authData.user.identities && authData.user.identities.length === 0) {
                setError("An account with this email already exists. Please sign in instead.")
                setIsLoading(false)
                return
            }

            // 2. Complete Signup via RPC (Safe & Atomic)
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
                    // Don't throw - user is already created in auth, profile might create via trigger
                }

                if (rpcData && !rpcData.success) {
                    console.warn("RPC returned error:", rpcData.error)
                    // Don't throw - let trigger handle it
                }
            } catch (rpcErr: any) {
                console.warn("RPC failed:", rpcErr.message)
                // Continue anyway - user is created, trigger should handle profile
            }

            // Save email so verify-email page can resend without a session
            // (Supabase doesn't create a session until email is verified)
            sessionStorage.setItem('pending_verification_email', email)
            router.push("/verify-email")

        } catch (err: any) {
            toast({
                title: "Signup Failed",
                description: err.message || "An unexpected error occurred",
                type: "error"
            })
            setError(err instanceof Error ? err.message : "An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
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
                                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Get Started</h1>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Create a new company account</p>
                            </div>

                            <Card className="border-0 shadow-xl sm:border sm:shadow-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-800">
                                <CardHeader className="space-y-1 pb-4">
                                    <CardTitle className="text-xl text-center">Create Account</CardTitle>
                                    <CardDescription className="text-center text-slate-500 dark:text-slate-400">
                                        Start managing your deliveries today
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={onSubmit} className="space-y-4">
                                        {error && (
                                            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4" />
                                                {error}
                                            </div>
                                        )}

                                        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium leading-none" htmlFor="full_name">
                                                    Full Name
                                                </label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                                    <Input
                                                        id="full_name"
                                                        name="full_name"
                                                        placeholder="John Doe"
                                                        type="text"
                                                        className="pl-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium leading-none" htmlFor="company_name">
                                                    Company
                                                </label>
                                                <div className="relative">
                                                    <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                                    <Input
                                                        id="company_name"
                                                        name="company_name"
                                                        placeholder="Acme Inc."
                                                        type="text"
                                                        className="pl-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium leading-none" htmlFor="phone">
                                                Phone Number
                                            </label>
                                            <StyledPhoneInput
                                                name="phone"
                                                value={phoneValue}
                                                onChange={setPhoneValue}
                                                placeholder="Enter your phone number"
                                                className="h-11 bg-white/50 dark:bg-slate-950/50"
                                                required
                                            />
                                        </div>

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
                                                    className="pl-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium leading-none" htmlFor="password">
                                                Password
                                            </label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                                <Input
                                                    id="password"
                                                    name="password"
                                                    placeholder="••••••••"
                                                    type={showPassword ? "text" : "password"}
                                                    autoCapitalize="none"
                                                    autoComplete="new-password"
                                                    className="pl-9 pr-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                    required
                                                    minLength={8}
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
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Must be at least 8 characters
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium leading-none" htmlFor="confirm_password">
                                                Confirm Password
                                            </label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                                <Input
                                                    id="confirm_password"
                                                    name="confirm_password"
                                                    placeholder="••••••••"
                                                    type={showPassword ? "text" : "password"}
                                                    autoCapitalize="none"
                                                    autoComplete="new-password"
                                                    className="pl-9 pr-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                    required
                                                    minLength={8}
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
                                                    Creating account...
                                                </div>
                                            ) : (
                                                "Create Account"
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

                                                        // Open in SYSTEM browser (not WebView) on mobile
                                                        if (isNative && data?.url) {
                                                            await Browser.open({ url: data.url, windowName: '_system' })
                                                        }
                                                    } catch (err: any) {
                                                        toast({
                                                            title: "Sign up failed",
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
                                                        const redirectUrl = isNative
                                                            ? 'io.raute.app://auth/callback'
                                                            : `${window.location.origin}/auth/callback`

                                                        const { data, error } = await supabase.auth.signInWithOAuth({
                                                            provider: 'google',
                                                            options: {
                                                                redirectTo: redirectUrl,
                                                                skipBrowserRedirect: isNative,
                                                                queryParams: {
                                                                    access_type: 'offline',
                                                                    prompt: 'consent',
                                                                }
                                                            }
                                                        })
                                                        if (error) throw error

                                                        // Open in SYSTEM browser (not WebView) on mobile
                                                        if (isNative && data?.url) {
                                                            await Browser.open({ url: data.url, windowName: '_system' })
                                                        }
                                                    } catch (err: any) {
                                                        toast({
                                                            title: "Sign up failed",
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
                                        Already have an account?{" "}
                                        <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500 hover:underline">
                                            Sign in
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
                <div className="flex min-h-screen items-center justify-center px-4 safe-area-p bg-slate-50 dark:bg-slate-950">
                    <div className="w-full max-w-md space-y-8">
                        <div className="text-center space-y-2">
                            <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-white dark:bg-slate-800 shadow-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
                                <img
                                    src="/logo.png"
                                    alt="Raute Logo"
                                    className="h-14 w-14 object-contain"
                                />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Get Started</h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Create a new company account</p>
                        </div>

                        <Card className="border-0 shadow-xl sm:border sm:shadow-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-800">
                            <CardHeader className="space-y-1 pb-4">
                                <CardTitle className="text-xl text-center">Create Account</CardTitle>
                                <CardDescription className="text-center text-slate-500 dark:text-slate-400">
                                    Start managing your deliveries today
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={onSubmit} className="space-y-4">
                                    {error && (
                                        <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4" />
                                            {error}
                                        </div>
                                    )}

                                    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium leading-none" htmlFor="full_name">
                                                Full Name
                                            </label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                                <Input
                                                    id="full_name"
                                                    name="full_name"
                                                    placeholder="John Doe"
                                                    type="text"
                                                    className="pl-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium leading-none" htmlFor="company_name">
                                                Company
                                            </label>
                                            <div className="relative">
                                                <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                                <Input
                                                    id="company_name"
                                                    name="company_name"
                                                    placeholder="Acme Inc."
                                                    type="text"
                                                    className="pl-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium leading-none" htmlFor="phone">
                                            Phone Number
                                        </label>
                                        <StyledPhoneInput
                                            name="phone"
                                            value={phoneValue}
                                            onChange={setPhoneValue}
                                            placeholder="Enter your phone number"
                                            className="h-11 bg-white/50 dark:bg-slate-950/50"
                                            required
                                        />
                                    </div>

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
                                                className="pl-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium leading-none" htmlFor="password">
                                            Password
                                        </label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                            <Input
                                                id="password"
                                                name="password"
                                                placeholder="••••••••"
                                                type={showPassword ? "text" : "password"}
                                                autoCapitalize="none"
                                                autoComplete="new-password"
                                                className="pl-9 pr-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                required
                                                minLength={8}
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
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Must be at least 8 characters
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium leading-none" htmlFor="mobile_confirm_password">
                                            Confirm Password
                                        </label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                            <Input
                                                id="mobile_confirm_password"
                                                name="confirm_password"
                                                placeholder="••••••••"
                                                type={showPassword ? "text" : "password"}
                                                autoCapitalize="none"
                                                autoComplete="new-password"
                                                className="pl-9 pr-9 h-11 bg-white/50 dark:bg-slate-950/50"
                                                required
                                                minLength={8}
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
                                                Creating account...
                                            </div>
                                        ) : (
                                            "Create Account"
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

                                                    // Open in SYSTEM browser (not WebView) on mobile
                                                    if (isNative && data?.url) {
                                                        await Browser.open({ url: data.url, windowName: '_system' })
                                                    }
                                                } catch (err: any) {
                                                    toast({
                                                        title: "Sign up failed",
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
                                                    const redirectUrl = isNative
                                                        ? 'io.raute.app://auth/callback'
                                                        : `${window.location.origin}/auth/callback`

                                                    const { data, error } = await supabase.auth.signInWithOAuth({
                                                        provider: 'google',
                                                        options: {
                                                            redirectTo: redirectUrl,
                                                            skipBrowserRedirect: isNative,
                                                            queryParams: {
                                                                access_type: 'offline',
                                                                prompt: 'consent',
                                                            }
                                                        }
                                                    })
                                                    if (error) throw error

                                                    // Open in SYSTEM browser (not WebView) on mobile
                                                    if (isNative && data?.url) {
                                                        await Browser.open({ url: data.url, windowName: '_system' })
                                                    }
                                                } catch (err: any) {
                                                    toast({
                                                        title: "Sign up failed",
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
                                    Already have an account?{" "}
                                    <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500 hover:underline">
                                        Sign in
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

