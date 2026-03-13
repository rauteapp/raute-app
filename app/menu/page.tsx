'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTheme } from 'next-themes'
import { useToast } from '@/components/toast-provider'
import { useConfirm } from '@/hooks/use-confirm'
import { markIntentionalLogout } from '@/components/auth-check'
import { ThemeToggle } from '@/components/theme-toggle'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
    User, Mail, Crown, Sparkles, Moon, Lock, LogOut, ChevronRight,
    Building2, Users, Truck, ArrowLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MenuPage() {
    const router = useRouter()
    const { toast } = useToast()
    const confirm = useConfirm()

    const [userRole, setUserRole] = useState<string | null>(null)
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [planName, setPlanName] = useState<string | null>(null)
    const [isTrialActive, setIsTrialActive] = useState(false)
    const [trialDaysRemaining, setTrialDaysRemaining] = useState(0)

    // Security
    const [changingPassword, setChangingPassword] = useState(false)
    const [isPasswordSheetOpen, setIsPasswordSheetOpen] = useState(false)
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [sendingReset, setSendingReset] = useState(false)

    async function handleChangePassword() {
        if (!currentPassword) {
            toast({ title: 'Please enter your current password', type: 'error' })
            return
        }
        if (newPassword !== confirmPassword) {
            toast({ title: 'Passwords do not match!', type: 'error' })
            return
        }
        if (newPassword.length < 8) {
            toast({ title: 'Password must be at least 8 characters', type: 'error' })
            return
        }
        try {
            setChangingPassword(true)

            // Verify current password first
            const { error: verifyError } = await supabase.auth.signInWithPassword({
                email: userEmail!,
                password: currentPassword,
            })
            if (verifyError) {
                toast({ title: 'Current password is incorrect', type: 'error' })
                return
            }

            // Update to new password
            const { error } = await supabase.auth.updateUser({ password: newPassword })
            if (error) throw error
            toast({ title: 'Password changed successfully!', type: 'success' })
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setIsPasswordSheetOpen(false)
        } catch {
            toast({ title: 'Error changing password', type: 'error' })
        } finally {
            setChangingPassword(false)
        }
    }

    async function handleForgotPassword() {
        if (!userEmail) {
            toast({ title: 'No email found for your account', type: 'error' })
            return
        }
        try {
            setSendingReset(true)
            const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
                redirectTo: 'https://raute.io/update-password',
            })
            if (error) throw error
            toast({ title: 'Password reset link sent to your email', type: 'success' })
            setIsPasswordSheetOpen(false)
        } catch {
            toast({ title: 'Failed to send reset link', type: 'error' })
        } finally {
            setSendingReset(false)
        }
    }

    async function handleLogout() {
        const ok = await confirm({
            title: 'Log out',
            description: 'Are you sure you want to log out of your account?',
            confirmText: 'Log out',
        })
        if (!ok) return
        try {
            // Stop any active location tracking before signing out
            import('@/lib/geo-service').then(({ geoService }) => geoService.stopTracking()).catch(() => {})
            markIntentionalLogout()
            await supabase.auth.signOut()
            router.push('/login')
        } catch {
            toast({ title: 'Log out failed', type: 'error' })
            router.push('/login')
        }
    }

    useEffect(() => {
        let mounted = true

        const fetchData = async (userId: string) => {
            try {
                // Fetch role
                let { data: userProfile } = await supabase
                    .from('users')
                    .select('role, trial_ends_at')
                    .eq('id', userId)
                    .maybeSingle()

                if (!userProfile?.role) {
                    const { data: driverEntry } = await supabase
                        .from('drivers')
                        .select('id')
                        .eq('user_id', userId)
                        .maybeSingle()
                    if (driverEntry) userProfile = { role: 'driver', trial_ends_at: null } as any
                }

                if (mounted && userProfile?.role) {
                    setUserRole(userProfile.role)

                    // Subscription info for managers
                    if (userProfile.role === 'manager' || userProfile.role === 'admin' || userProfile.role === 'company_admin') {
                        const { data: sub } = await supabase
                            .from('subscription_history')
                            .select('tier_name')
                            .eq('user_id', userId)
                            .eq('is_active', true)
                            .maybeSingle()

                        if (mounted) {
                            if (sub?.tier_name) {
                                const name = sub.tier_name.replace(/^(raute_|stripe_)/, '').replace(/_(monthly|annual)$/, '')
                                setPlanName(name.charAt(0).toUpperCase() + name.slice(1))
                            } else if (userProfile.trial_ends_at) {
                                const trialEnd = new Date(userProfile.trial_ends_at)
                                const now = new Date()
                                const days = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                                if (days > 0) {
                                    setIsTrialActive(true)
                                    setTrialDaysRemaining(days)
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Error fetching menu data:', err)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        const init = async () => {
            // Try cached role first for instant display
            const cachedRole = typeof window !== 'undefined' ? localStorage.getItem('raute_user_role') : null
            if (cachedRole) {
                setUserRole(cachedRole)
                setLoading(false)
            }

            try {
                const { data: { session } } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
                ])
                if (session?.user) {
                    setUserEmail(session.user.email ?? null)
                    fetchData(session.user.id)
                } else {
                    // Check custom session (driver login)
                    const customUserId = typeof window !== 'undefined' ? localStorage.getItem('raute_user_id') : null
                    if (customUserId) {
                        fetchData(customUserId)
                    } else {
                        if (mounted) setLoading(false)
                    }
                }
            } catch {
                try {
                    const { data: userData } = await supabase.auth.getUser()
                    if (userData.user) {
                        setUserEmail(userData.user.email ?? null)
                        fetchData(userData.user.id)
                    } else {
                        if (mounted) setLoading(false)
                    }
                } catch {
                    if (mounted) setLoading(false)
                }
            }
        }

        init()
        return () => { mounted = false }
    }, [])

    const isManager = userRole === 'manager' || userRole === 'admin' || userRole === 'company_admin'

    return (
        <div
            className="min-h-screen bg-slate-50 dark:bg-slate-950"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))' }}
        >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
                <div className="flex items-center h-14 px-5 max-w-lg mx-auto">
                    <button
                        onClick={() => router.back()}
                        className="p-2 -ml-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                        <ArrowLeft size={22} className="text-slate-700 dark:text-slate-300" />
                    </button>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white ml-2">Settings</h1>
                </div>
            </div>

            <div className="px-5 py-6 max-w-lg mx-auto pb-32">
                <div className="flex flex-col gap-6">

                    {/* Subscription Banner - managers only */}
                    {isManager && (
                        <Link href="/subscribe" className="block">
                            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border border-slate-700/50 p-6 text-white shadow-lg shadow-black/20 active:scale-[0.98] transition-transform">
                                <Sparkles className="absolute top-4 right-5 text-blue-400/60 w-5 h-5 animate-pulse" />
                                <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl" />
                                <div className="flex flex-col items-start gap-4 relative z-10">
                                    <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
                                        <Crown className="h-3 w-3" />
                                        {planName ? planName.toUpperCase() + ' PLAN' : 'PREMIUM'}
                                    </div>
                                    <div className="w-full flex items-center justify-between gap-4">
                                        <h3 className="text-lg font-bold leading-tight">
                                            {planName
                                                ? <>{planName} Plan<br /><span className="text-white/70 text-sm font-medium">Manage your subscription</span></>
                                                : isTrialActive
                                                    ? <>Free Trial<br /><span className="text-white/70 text-sm font-medium">{trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'} remaining</span></>
                                                    : <>Upgrade to Pro<br /><span className="text-white/70 text-sm font-medium">Unlock all premium features</span></>
                                            }
                                        </h3>
                                        <span className="flex-shrink-0 bg-white hover:bg-slate-100 text-slate-900 font-bold px-5 py-2.5 rounded-full text-sm shadow-md">
                                            {planName ? 'Manage' : 'Upgrade'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    )}

                    {/* Account Section */}
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-4">Account</span>
                        <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                            <ListItem
                                icon={Mail}
                                label="Email"
                                value={userEmail || 'Not available'}
                                hasDivider={isManager}
                            />
                            {isManager && (
                                <Link
                                    href="/subscribe"
                                    className="flex items-center px-4 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                >
                                    <div className="text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg mr-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
                                        <Crown size={18} strokeWidth={2} />
                                    </div>
                                    <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                                        <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">Plan</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[15px] text-slate-500 dark:text-slate-400">
                                                {planName
                                                    ? planName
                                                    : isTrialActive
                                                        ? `Trial \u00B7 ${trialDaysRemaining}d`
                                                        : 'Free'}
                                            </span>
                                            <ChevronRight size={18} className="text-slate-400/70" />
                                        </div>
                                    </div>
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* General Section */}
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-4">General</span>
                        <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                            <ListLink href="/profile" icon={User} label="Edit Profile" hasDivider />
                            <ListToggle icon={Moon} label="Dark Mode" hasDivider>
                                <ThemeToggle />
                            </ListToggle>
                            <ListButton
                                icon={Lock}
                                label="Security"
                                onClick={() => setIsPasswordSheetOpen(true)}
                                hasDivider
                            />
                            <ListButton
                                icon={LogOut}
                                label="Logout"
                                onClick={handleLogout}
                                isDestructive
                            />
                        </div>
                    </div>

                    {/* Team Management - managers only */}
                    {isManager && (
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-4">Team Management</span>
                            <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                                <ListLink href="/settings" icon={Building2} label="Company Settings" hasDivider />
                                <ListLink href="/dispatchers" icon={Users} label="Team & Dispatchers" hasDivider />
                                <ListLink href="/drivers" icon={Truck} label="Drivers Overview" />
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* Change Password Sheet */}
            <Sheet open={isPasswordSheetOpen} onOpenChange={setIsPasswordSheetOpen}>
                <SheetContent side="bottom" className="h-[70vh] overflow-y-auto rounded-t-3xl safe-area-pt z-[10002]">
                    <SheetHeader className="mb-6">
                        <SheetTitle className="text-2xl font-bold text-slate-900 dark:text-white">Change Password</SheetTitle>
                    </SheetHeader>
                    <div className="space-y-5 px-4 pb-12 max-w-lg mx-auto">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-900 dark:text-slate-200">Current Password</label>
                            <Input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Enter current password"
                                className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                            />
                            <button
                                onClick={handleForgotPassword}
                                disabled={sendingReset}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                                {sendingReset ? 'Sending...' : 'Forgot your password?'}
                            </button>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-900 dark:text-slate-200">New Password</label>
                            <Input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                minLength={8}
                                className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-900 dark:text-slate-200">Confirm Password</label>
                            <Input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                minLength={8}
                                className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                            />
                        </div>
                        <Button
                            onClick={handleChangePassword}
                            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                            className="w-full h-14 bg-amber-600 hover:bg-amber-700 font-bold text-lg rounded-xl shadow-lg shadow-amber-500/20 mt-4 text-white"
                        >
                            <Lock size={20} className="mr-2" />
                            {changingPassword ? 'Updating...' : 'Change Password'}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}

// --- iOS-style list components ---

function ListItem({ icon: Icon, label, value, hasDivider }: { icon: any; label: string; value?: string; hasDivider?: boolean }) {
    return (
        <div className="relative">
            <div className="flex items-center px-4 py-3.5 bg-white dark:bg-slate-900 cursor-default">
                <div className="text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg mr-4">
                    <Icon size={18} strokeWidth={2} />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-2">
                    <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">{label}</span>
                    {value && (
                        <span className="text-[15px] text-slate-500 dark:text-slate-400 truncate ml-4 max-w-[60%]">
                            {value}
                        </span>
                    )}
                </div>
            </div>
            {hasDivider && <div className="h-[1px] bg-slate-100 dark:bg-slate-800 ml-[3.25rem] mr-2" />}
        </div>
    )
}

function ListLink({ href, icon: Icon, label, hasDivider }: { href: string; icon: any; label: string; hasDivider?: boolean }) {
    return (
        <div className="relative">
            <Link
                href={href}
                className="flex items-center px-4 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
            >
                <div className="text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg mr-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
                    <Icon size={18} strokeWidth={2} />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                    <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">{label}</span>
                    <ChevronRight size={18} className="text-slate-400/70" />
                </div>
            </Link>
            {hasDivider && <div className="h-[1px] bg-slate-100 dark:bg-slate-800 ml-[3.25rem] mr-2" />}
        </div>
    )
}

function ListButton({ icon: Icon, label, onClick, hasDivider, isDestructive }: { icon: any; label: string; onClick?: () => void; hasDivider?: boolean; isDestructive?: boolean }) {
    return (
        <div className="relative">
            <button
                onClick={onClick}
                className="w-full flex items-center px-4 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
            >
                <div className={cn("p-1.5 rounded-lg mr-4 shadow-sm border", isDestructive ? "text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200/50 dark:border-red-900/50" : "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50")}>
                    <Icon size={18} strokeWidth={2} />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                    <span className={cn("text-[15px] font-medium", isDestructive ? "text-red-600 dark:text-red-500" : "text-slate-800 dark:text-slate-200")}>{label}</span>
                    <ChevronRight size={18} className={cn(isDestructive ? "text-red-400/50" : "text-slate-400/70")} />
                </div>
            </button>
            {hasDivider && <div className="h-[1px] bg-slate-100 dark:bg-slate-800 ml-[3.25rem] mr-2" />}
        </div>
    )
}

function ListToggle({ icon: Icon, label, hasDivider, children }: { icon: any; label: string; hasDivider?: boolean; children: React.ReactNode }) {
    return (
        <div className="relative">
            <div className="flex items-center px-4 py-3 bg-white dark:bg-slate-900">
                <div className="text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg mr-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
                    <Icon size={18} strokeWidth={2} />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                    <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">{label}</span>
                    {children}
                </div>
            </div>
            {hasDivider && <div className="h-[1px] bg-slate-100 dark:bg-slate-800 ml-[3.25rem] mr-2" />}
        </div>
    )
}
