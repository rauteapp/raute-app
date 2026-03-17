"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, AlertCircle } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/toast-provider"
import { friendlyError } from "@/lib/friendly-error"
import { StyledPhoneInput } from "@/components/ui/styled-phone-input"
import { isValidPhoneNumber } from "react-phone-number-input"
import { MobileAuthWrapper } from "@/components/mobile-auth-wrapper"
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

const testimonials = [
    { quote: "We used to spend 2 hours every morning planning routes on paper. Now it takes 5 minutes. I wish I found Raute sooner.", name: "Marcus T.", role: "Fleet Manager, 12 drivers" },
    { quote: "My drivers were constantly calling asking where to go next. Since switching to Raute, my phone barely rings. They just follow the app.", name: "Jennifer R.", role: "Operations Director" },
    { quote: "We cut our fuel costs by 30% in the first month. The routes are smarter than anything we could plan ourselves.", name: "David K.", role: "Owner, Local Delivery Co." },
];

export default function SignupPage() {
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [phoneValue, setPhoneValue] = useState<string | undefined>('')
    const [currentTestimonial, setCurrentTestimonial] = useState(0)
    const { toast } = useToast()

    // Rotate testimonials
    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentTestimonial((prev) => (prev + 1) % testimonials.length)
        }, 5000)
        return () => clearTimeout(timer)
    }, [currentTestimonial])

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
                    // RPC error (non-fatal) - user is already created in auth, profile might create via trigger
                }

                if (rpcData && !rpcData.success) {
                    // RPC returned error - let trigger handle it
                }
            } catch (rpcErr: any) {
                // RPC failed (non-fatal) - user is created, trigger should handle profile
            }

            // Save email so verify-email page can resend without a session
            // (Supabase doesn't create a session until email is verified)
            sessionStorage.setItem('pending_verification_email', email)
            router.push("/verify-email")

        } catch (err: any) {
            toast({
                title: "Signup Failed",
                description: friendlyError(err),
                type: "error"
            })
            setError(err instanceof Error ? err.message : "An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    // Shared form content for both web and mobile
    const formContent = (variant: 'web' | 'mobile') => (
        <form onSubmit={onSubmit} className="space-y-4">
            {error && (
                <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}

            {/* Full Name & Company side by side */}
            <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1.5 text-left">
                    <label className="text-sm font-medium leading-none text-slate-700 dark:text-slate-300" htmlFor={`full_name-${variant}`}>
                        Full name*
                    </label>
                    <Input
                        id={`full_name-${variant}`}
                        name="full_name"
                        placeholder="John Doe"
                        type="text"
                        className={`h-${variant === 'web' ? '11' : '12'} bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 rounded-lg focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px] ${variant === 'web' ? 'px-3 shadow-none' : ''}`}
                        disabled={isLoading}
                        required
                    />
                </div>
                <div className="space-y-1.5 text-left">
                    <label className="text-sm font-medium leading-none text-slate-700 dark:text-slate-300" htmlFor={`company_name-${variant}`}>
                        Company*
                    </label>
                    <Input
                        id={`company_name-${variant}`}
                        name="company_name"
                        placeholder="Acme Inc."
                        type="text"
                        className={`h-${variant === 'web' ? '11' : '12'} bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 rounded-lg focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px] ${variant === 'web' ? 'px-3 shadow-none' : ''}`}
                        disabled={isLoading}
                        required
                    />
                </div>
            </div>

            {/* Phone Number */}
            <div className="space-y-1.5 text-left">
                <label className="text-sm font-medium leading-none text-slate-700 dark:text-slate-300" htmlFor={`phone-${variant}`}>
                    Phone number*
                </label>
                <StyledPhoneInput
                    name="phone"
                    value={phoneValue}
                    onChange={setPhoneValue}
                    placeholder="Enter your phone number"
                    className={`h-${variant === 'web' ? '11' : '12'} bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 rounded-lg`}
                    required
                />
            </div>

            {/* Email */}
            <div className="space-y-1.5 text-left">
                <label className="text-sm font-medium leading-none text-slate-700 dark:text-slate-300" htmlFor={`email-${variant}`}>
                    Work email*
                </label>
                <Input
                    id={`email-${variant}`}
                    name="email"
                    placeholder="name@example.com"
                    type="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    className={`h-${variant === 'web' ? '11' : '12'} bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 rounded-lg focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px] ${variant === 'web' ? 'px-3 shadow-none' : ''}`}
                    disabled={isLoading}
                    required
                />
            </div>

            {/* Password */}
            <div className="space-y-1.5 text-left">
                <label className="text-sm font-medium leading-none text-slate-700 dark:text-slate-300" htmlFor={`password-${variant}`}>
                    Password*
                </label>
                <div className="relative">
                    <Input
                        id={`password-${variant}`}
                        name="password"
                        placeholder="Min. 8 characters"
                        type={showPassword ? "text" : "password"}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        className={`pr-10 h-${variant === 'web' ? '11' : '12'} bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 rounded-lg focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px] ${variant === 'web' ? 'shadow-none' : ''}`}
                        disabled={isLoading}
                        required
                        minLength={8}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`absolute right-0 top-0 h-${variant === 'web' ? '11' : '12'} w-${variant === 'web' ? '11' : '12'} px-3 py-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400`}
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

            {/* Confirm Password */}
            <div className="space-y-1.5 text-left">
                <label className="text-sm font-medium leading-none text-slate-700 dark:text-slate-300" htmlFor={`confirm_password-${variant}`}>
                    Confirm password*
                </label>
                <div className="relative">
                    <Input
                        id={`confirm_password-${variant}`}
                        name="confirm_password"
                        placeholder="Re-enter password"
                        type={showPassword ? "text" : "password"}
                        autoCapitalize="none"
                        autoComplete="new-password"
                        className={`pr-10 h-${variant === 'web' ? '11' : '12'} bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 rounded-lg focus-visible:ring-blue-600 focus-visible:border-blue-600 text-[15px] ${variant === 'web' ? 'shadow-none' : ''}`}
                        disabled={isLoading}
                        required
                        minLength={8}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`absolute right-0 top-0 h-${variant === 'web' ? '11' : '12'} w-${variant === 'web' ? '11' : '12'} px-3 py-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400`}
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

            {/* Create Account Button */}
            <Button className={`w-full h-${variant === 'web' ? '11' : '12'} mt-2 text-[15px] font-medium rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white transition-colors shadow-none`} type="submit" disabled={isLoading}>
                {isLoading ? (
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Creating account...
                    </div>
                ) : (
                    "Create account"
                )}
            </Button>

            {/* Google OAuth Button */}
            <div className="pt-2">
                <Button
                    type="button"
                    variant="outline"
                    className={`w-full h-${variant === 'web' ? '11' : '12'} text-[15px] font-medium bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 gap-2`}
                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={async () => {
                        setIsLoading(true)
                        try {
                            const isNative = Capacitor.isNativePlatform()

                            if (isNative) {
                                // Native: Use Google Sign-In SDK for native account picker
                                const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')

                                await GoogleAuth.initialize({
                                    clientId: '825364238291-e8volfitrt9rnjmcm2bqfbkcac82frur.apps.googleusercontent.com',
                                    scopes: ['profile', 'email'],
                                    grantOfflineAccess: true,
                                })

                                const googleUser = await GoogleAuth.signIn()
                                const idToken = googleUser.authentication?.idToken

                                if (!idToken) throw new Error('No ID token received from Google')

                                const { error } = await supabase.auth.signInWithIdToken({
                                    provider: 'google',
                                    token: idToken,
                                })
                                if (error) throw error
                            } else {
                                // Web: Use Supabase OAuth redirect flow
                                const redirectUrl = `${window.location.origin}/auth/callback`

                                const { data, error } = await supabase.auth.signInWithOAuth({
                                    provider: 'google',
                                    options: {
                                        redirectTo: redirectUrl,
                                        queryParams: {
                                            access_type: 'offline',
                                            prompt: 'consent',
                                        }
                                    }
                                })
                                if (error) throw error
                            }
                        } catch (err: any) {
                            const errorMsg = err instanceof Error ? err.message : String(err)
                            setError(errorMsg)
                            setIsLoading(false)
                        }
                    }}
                    disabled={isLoading}
                >
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign up with Google
                </Button>
            </div>

            {/* Apple OAuth Button */}
            <div>
                <Button
                    type="button"
                    variant="outline"
                    className={`w-full h-${variant === 'web' ? '11' : '12'} text-[15px] font-medium bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 gap-2`}
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

                            if (isNative && data?.url) {
                                await Browser.open({ url: data.url, windowName: '_system' })
                            }
                        } catch (err: any) {
                            toast({
                                title: "Sign up failed",
                                description: friendlyError(err),
                                type: "error"
                            })
                            setIsLoading(false)
                        }
                    }}
                    disabled={isLoading}
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    Sign up with Apple
                </Button>
            </div>

            <div className="mt-4 pt-4 pb-2 border-b border-[#f1f5f9] dark:border-slate-800 flex justify-center w-full">
                <button type="button" className="text-[14px] font-medium text-[#2563eb] hover:text-[#1d4ed8] inline-flex items-center">
                    More sign up options
                    <svg className="ml-1.5 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
            </div>
        </form>
    )

    return (
        <MobileAuthWrapper
            // Mobile version: Clean interface without navbar/footer
            mobileChildren={
                <div className="flex min-h-screen items-center justify-center p-4 safe-area-p bg-white dark:bg-slate-950">
                    <div className="w-full max-w-sm space-y-6">
                        <div className="text-center space-y-3">
                            <div className="inline-flex items-center justify-center mx-auto mb-2">
                                <img src="/logo.png" alt="Raute" className="h-[48px] w-auto object-contain" />
                            </div>
                            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Create account</h1>
                            <p className="text-[15px] text-slate-500 dark:text-slate-400">Start managing your deliveries</p>
                        </div>

                        <div className="mt-8">
                            {formContent('mobile')}

                            <div className="mt-6 text-center space-y-4">
                                <div className="text-[14px] text-slate-700 dark:text-slate-300">
                                    Already have an account?{" "}
                                    <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                                        Log in
                                    </Link>
                                </div>
                                <p className="text-xs text-slate-400 font-medium pb-2">
                                    Delivering over 1 billion packages a year
                                </p>
                            </div>
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
                        <div className="w-full max-w-[400px] px-4 space-y-6">
                            <div className="text-center space-y-3">
                                <div className="inline-flex items-center justify-center mx-auto mb-2">
                                    <img src="/logo.png" alt="Raute" className="h-[48px] w-auto object-contain" />
                                </div>
                                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Create account</h1>
                                <p className="text-[15px] text-slate-500">Start managing your deliveries today</p>
                            </div>

                            <div className="mt-8">
                                {formContent('web')}

                                <div className="mt-6 text-center space-y-4">
                                    <div className="text-[14px] text-slate-700">
                                        Already have an account?{" "}
                                        <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                                            Log in
                                        </Link>
                                    </div>
                                    <p className="text-[13px] text-slate-400 font-medium pb-2">
                                        Delivering over 1 billion packages a year
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Divider visual element */}
                    <div className="hidden lg:block w-[4px] rounded-full h-[600px] mt-24 bg-slate-200"></div>

                    {/* Right Column - Promotional */}
                    <div className="hidden lg:flex w-[55%] p-3 pb-3">
                        {/* the card wrapper */}
                        <div className="w-full h-full bg-[#1c3e8e] text-white pt-16 flex-col relative overflow-hidden rounded-[1.8rem] flex justify-start items-center border-[0.5px] border-blue-900 shadow-xl shadow-[#1e40af]/10">
                            {/* Inner Content limit */}
                            <div className="relative z-10 w-full max-w-lg mt-12 flex flex-col items-center">
                                <h2 className="text-[1.8rem] tracking-tight font-medium leading-[1.4] mb-4 text-center px-4 text-white/95 min-h-[120px] transition-opacity duration-500">
                                    &quot;{testimonials[currentTestimonial].quote}&quot;
                                </h2>
                                <p className="text-sm text-white/60 mb-6">
                                    <span className="font-semibold text-white/80">{testimonials[currentTestimonial].name}</span> &mdash; {testimonials[currentTestimonial].role}
                                </p>

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
