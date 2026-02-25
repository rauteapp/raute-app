'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Clock, Mail, Shield } from 'lucide-react'

export default function PendingActivationPage() {
    const [userEmail, setUserEmail] = useState('')
    const router = useRouter()

    useEffect(() => {
        const checkStatus = async () => {
            let userId: string | null = null
            let email: string | null = null
            let role: string | null = null

            try {
                // getSession() can hang on web due to navigator.locks — add timeout
                const { data: { session } } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('getSession timeout')), 5000)
                    ),
                ])
                if (session) {
                    userId = session.user.id
                    email = session.user.email || ''
                    role = session.user.user_metadata?.role || null
                }
            } catch {
                // getSession timed out — try getUser() as fallback
                try {
                    const { data: userData } = await supabase.auth.getUser()
                    if (userData.user) {
                        userId = userData.user.id
                        email = userData.user.email || ''
                        role = userData.user.user_metadata?.role || null
                    }
                } catch {
                    // Both failed
                }
            }

            if (!userId) {
                router.push('/login')
                return
            }

            setUserEmail(email || '')

            // Check if user is now activated (poll every 5 seconds)
            const interval = setInterval(async () => {
                if (role === 'driver' || role === 'dispatcher') {
                    const { data: driverData } = await supabase
                        .from('drivers')
                        .select('is_active')
                        .eq('user_id', userId!)
                        .single()

                    if (driverData?.is_active) {
                        clearInterval(interval)
                        router.push('/dashboard')
                    }
                }
            }, 5000) // Check every 5 seconds

            return () => clearInterval(interval)
        }

        checkStatus()
    }, [router])

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 safe-area-p">
            <div className="max-w-md w-full">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-900/50 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-center">
                        <div className="mx-auto h-16 w-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mb-3">
                            <Clock className="h-8 w-8 text-white animate-pulse" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-1">Account Pending Activation</h1>
                        <p className="text-amber-100 text-sm">Your account is being reviewed</p>
                    </div>

                    {/* Content */}
                    <div className="p-8 space-y-6">
                        <div className="text-center space-y-3">
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                Your account has been successfully created and your email has been verified.
                            </p>
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                <Mail className="h-4 w-4" />
                                <span className="font-mono">{userEmail}</span>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-amber-200 dark:border-amber-900/50">
                            <div className="flex items-start gap-3">
                                <div className="mt-1">
                                    <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                                        Waiting for Manager Approval
                                    </h3>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                        Your fleet manager needs to activate your account before you can start working.
                                        This usually takes a few minutes.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 text-center">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                This page will automatically refresh when your account is activated.
                            </p>
                            <div className="flex justify-center items-center gap-1">
                                <div className="h-2 w-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="h-2 w-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="h-2 w-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-amber-200 dark:border-amber-900/50">
                            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                                Need help? Contact your fleet manager directly.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
