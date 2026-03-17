"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet"
import {
    Plus, MapPin, Building2, Trash2, ArrowLeft, Search, Settings2, Weight, MapPinned,
    Mail, UserCircle, Moon, Lock, LogOut, ChevronRight, Users, Truck, CreditCard, Crown
} from "lucide-react"
import LocationPicker from "@/components/location-picker"
import { useToast } from "@/components/toast-provider"
import { useConfirm } from "@/hooks/use-confirm"
import { Skeleton } from "@/components/ui/skeleton"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { markIntentionalLogout } from "@/components/auth-check"
import type { CompanySettings } from "@/lib/supabase"

interface Hub {
    id: string
    name: string
    address: string
    latitude: number
    longitude: number
}

const DEFAULT_SETTINGS: Omit<CompanySettings, 'id' | 'company_id' | 'created_at' | 'updated_at'> = {
    weight_tracking_enabled: false,
    customer_tracking_enabled: true,
    customer_email_notifications: false,
}

export default function SettingsPage() {
    const router = useRouter()
    const { toast } = useToast()
    const confirm = useConfirm()
    const { theme, setTheme } = useTheme()

    const [hubs, setHubs] = useState<Hub[]>([])
    const [loading, setLoading] = useState(true)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [isCompanySettingsOpen, setIsCompanySettingsOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [companyId, setCompanyId] = useState<string | null>(null)
    const [featureSettings, setFeatureSettings] = useState(DEFAULT_SETTINGS)
    const [savingFeatures, setSavingFeatures] = useState(false)

    // User info
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [planName, setPlanName] = useState<string | null>(null)
    const [isTrialActive, setIsTrialActive] = useState(false)
    const [trialDaysRemaining, setTrialDaysRemaining] = useState(0)

    // Password change
    const [isPasswordOpen, setIsPasswordOpen] = useState(false)
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [changingPassword, setChangingPassword] = useState(false)

    // Form State
    const [newHubName, setNewHubName] = useState("")
    const [newHubAddress, setNewHubAddress] = useState("")
    const [newHubLoc, setNewHubLoc] = useState<{ lat: number, lng: number } | null>(null)

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        try {
            setLoading(true)

            // Auth with Fallback
            let userId: string | undefined
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                userId = user.id
                setUserEmail(user.email || null)
            }

            if (!userId) {
                router.push("/login")
                return
            }

            const { data: userProfile } = await supabase
                .from('users')
                .select('company_id, role, trial_ends_at')
                .eq('id', userId)
                .single()

            if (userProfile?.role) {
                setUserRole(userProfile.role)
            }

            // Fetch subscription info (managers only)
            if (userProfile?.role === 'manager' || userProfile?.role === 'admin' || userProfile?.role === 'company_admin') {
                const { data: sub } = await supabase
                    .from('subscription_history')
                    .select('tier_name')
                    .eq('user_id', userId)
                    .eq('is_active', true)
                    .maybeSingle()

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
                        setPlanName('Trial')
                    } else {
                        setPlanName('Free')
                    }
                } else {
                    setPlanName('Free')
                }
            }

            if (userProfile && userProfile.company_id) {
                setCompanyId(userProfile.company_id)

                const { data, error } = await supabase
                    .from('hubs')
                    .select('*')
                    .eq('company_id', userProfile.company_id)
                    .order('created_at', { ascending: false })

                if (error) throw error
                setHubs(data || [])

                // Fetch company settings
                const { data: settingsData } = await supabase
                    .from('company_settings')
                    .select('*')
                    .eq('company_id', userProfile.company_id)
                    .single()

                if (settingsData) {
                    setFeatureSettings({
                        weight_tracking_enabled: settingsData.weight_tracking_enabled,
                        customer_tracking_enabled: settingsData.customer_tracking_enabled,
                        customer_email_notifications: settingsData.customer_email_notifications,
                    })
                }
            }
        } catch (error) {
            toast({ title: "Failed to load settings", type: "error" })
        } finally {
            setLoading(false)
        }
    }

    async function handleAddHub() {
        if (!newHubName || !newHubAddress) {
            toast({ title: "Please enter name and address", type: "error" })
            return
        }
        if (!newHubLoc) {
            toast({ title: "Please select a location on the map", type: "error" })
            return
        }

        try {
            setSaving(true)
            const { data: { user } } = await supabase.auth.getUser()
            const { data: userProfile } = await supabase.from('users').select('company_id').eq('id', user?.id).single()

            if (!userProfile) {
                toast({ title: "Profile not found", type: "error" })
                return
            }

            const { error } = await supabase.from('hubs').insert({
                company_id: userProfile.company_id,
                name: newHubName,
                address: newHubAddress,
                latitude: newHubLoc.lat,
                longitude: newHubLoc.lng
            })

            if (error) throw error

            toast({ title: "Warehouse added successfully!", type: "success" })
            setNewHubName("")
            setNewHubAddress("")
            setNewHubLoc(null)
            setIsAddOpen(false)
            fetchData()
        } catch (error) {
            toast({ title: "Failed to add warehouse", type: "error" })
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteHub(id: string) {
        const ok = await confirm({ title: 'Delete warehouse', description: 'Are you sure you want to delete this warehouse? This cannot be undone.', variant: 'destructive' })
        if (!ok) return
        try {
            const { error } = await supabase.from('hubs').delete().eq('id', id)
            if (error) throw error
            setHubs(prev => prev.filter(h => h.id !== id))
            toast({ title: "Warehouse deleted", type: "success" })
        } catch (error) {
            toast({ title: "Failed to delete", type: "error" })
        }
    }

    async function handleToggleFeature(key: keyof typeof featureSettings) {
        if (!companyId) return
        const updated = { ...featureSettings, [key]: !featureSettings[key] }
        setFeatureSettings(updated)
        try {
            setSavingFeatures(true)
            const { error } = await supabase
                .from('company_settings')
                .upsert(
                    { company_id: companyId, ...updated },
                    { onConflict: 'company_id' }
                )
            if (error) throw error
            toast({ title: "Setting updated", type: "success" })
        } catch (error) {
            // Revert on failure
            setFeatureSettings(featureSettings)
            toast({ title: "Failed to update setting", type: "error" })
        } finally {
            setSavingFeatures(false)
        }
    }

    async function handleChangePassword() {
        if (!currentPassword) {
            toast({ title: "Please enter your current password", type: "error" })
            return
        }
        if (!newPassword || newPassword.length < 6) {
            toast({ title: "New password must be at least 6 characters", type: "error" })
            return
        }
        if (newPassword !== confirmPassword) {
            toast({ title: "Passwords don't match", type: "error" })
            return
        }

        try {
            setChangingPassword(true)

            // Verify current password by re-signing in
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: userEmail || '',
                password: currentPassword,
            })
            if (signInError) {
                toast({ title: "Current password is incorrect", type: "error" })
                return
            }

            // Update password
            const { error } = await supabase.auth.updateUser({ password: newPassword })
            if (error) throw error

            toast({ title: "Password changed successfully!", type: "success" })
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
            setIsPasswordOpen(false)
        } catch (error: any) {
            toast({ title: error?.message || "Failed to change password", type: "error" })
        } finally {
            setChangingPassword(false)
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
            import('@/lib/geo-service').then(({ geoService }) => geoService.stopTracking()).catch(() => {})
            markIntentionalLogout()
            await supabase.auth.signOut()
            router.push('/login')
        } catch {
            toast({ title: 'Log out failed', type: 'error' })
            router.push('/login')
        }
    }

    const isDarkMode = theme === 'dark'
    const isDriver = userRole === 'driver'
    const isManager = userRole === 'manager' || userRole === 'admin' || userRole === 'company_admin'
    const displayPlanName = planName || 'Free'
    const subscriptionLabel = isTrialActive
        ? `Trial (${trialDaysRemaining}d left)`
        : displayPlanName

    if (loading) {
        return (
            <div className="p-4 space-y-4 max-w-3xl mx-auto" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
                <Skeleton className="h-10 w-48 mb-6" />
                <Skeleton className="h-36 rounded-[24px]" />
                <Skeleton className="h-32 rounded-[24px]" />
                <Skeleton className="h-48 rounded-[24px]" />
            </div>
        )
    }

    return (
        <PullToRefresh onRefresh={fetchData}>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32">
                {/* Header */}
                <header
                    className="px-5 pb-4 flex items-center gap-3"
                    style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}
                >
                    <button onClick={() => router.back()} className="text-slate-900 dark:text-white">
                        <ArrowLeft size={24} strokeWidth={2.5} />
                    </button>
                    <h1 className="text-[22px] font-bold text-slate-900 dark:text-white tracking-tight">Settings</h1>
                </header>

                <main className="px-5 max-w-3xl mx-auto space-y-6">

                    {/* Driver Banner */}
                    {isDriver && (
                        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 dark:from-blue-700 dark:via-indigo-800 dark:to-violet-900 p-5 text-white shadow-xl">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
                            <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/3" />
                            <div className="absolute top-3 right-4 text-4xl animate-[wave_2s_ease-in-out_infinite]">
                                🚚
                            </div>
                            <div className="relative">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Truck size={16} className="text-blue-200" />
                                    <span className="text-[11px] font-bold tracking-widest text-blue-200 uppercase">Driver Account</span>
                                </div>
                                <h2 className="text-lg font-bold mb-0.5">{userEmail?.split('@')[0] || 'Driver'}</h2>
                                <p className="text-sm text-white/60">Manage your profile & preferences</p>
                            </div>
                        </div>
                    )}

                    {/* Subscription Banner (managers only) */}
                    {isManager && <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 dark:from-slate-800 dark:via-slate-900 dark:to-indigo-950 p-5 text-white shadow-xl">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                        <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                                <Crown size={16} className="text-amber-400" />
                                <span className="text-xs font-bold tracking-widest text-amber-400 uppercase">
                                    {isTrialActive ? 'FREE TRIAL' : `${displayPlanName.toUpperCase()} PLAN`}
                                </span>
                            </div>
                            <h2 className="text-lg font-bold mb-0.5">
                                {isTrialActive ? `Trial - ${trialDaysRemaining} days left` : `${displayPlanName} Plan`}
                            </h2>
                            <p className="text-sm text-white/60 mb-4">Manage your subscription</p>
                            <Link href="/subscribe">
                                <Button
                                    variant="secondary"
                                    className="bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-xl h-10 px-6"
                                >
                                    Manage
                                </Button>
                            </Link>
                        </div>
                    </div>}

                    {/* Account Section */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">Account</h3>
                        <div className="bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                            {/* Email */}
                            <div className="flex items-center px-4 py-3.5 gap-3">
                                <div className="h-9 w-9 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center shrink-0">
                                    <Mail size={18} className="text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] text-slate-500 dark:text-slate-400">Email</p>
                                    <p className="text-[15px] font-medium text-slate-900 dark:text-white truncate">{userEmail || '—'}</p>
                                </div>
                            </div>
                            {/* Plan (managers only) */}
                            {isManager && (
                                <Link href="/subscribe" className="flex items-center px-4 py-3.5 gap-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors">
                                    <div className="h-9 w-9 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center shrink-0">
                                        <CreditCard size={18} className="text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] text-slate-500 dark:text-slate-400">Plan</p>
                                        <p className="text-[15px] font-medium text-slate-900 dark:text-white">{subscriptionLabel}</p>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-400 shrink-0" />
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* General Section */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">General</h3>
                        <div className="bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                            {/* Edit Profile */}
                            <Link href="/profile" className="flex items-center px-4 py-3.5 gap-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors">
                                <div className="h-9 w-9 bg-indigo-50 dark:bg-indigo-950/30 rounded-full flex items-center justify-center shrink-0">
                                    <UserCircle size={18} className="text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <span className="flex-1 text-[15px] font-medium text-slate-900 dark:text-white">Edit Profile</span>
                                <ChevronRight size={18} className="text-slate-400 shrink-0" />
                            </Link>
                            {/* Dark Mode */}
                            <div className="flex items-center px-4 py-3.5 gap-3">
                                <div className="h-9 w-9 bg-purple-50 dark:bg-purple-950/30 rounded-full flex items-center justify-center shrink-0">
                                    <Moon size={18} className="text-purple-600 dark:text-purple-400" />
                                </div>
                                <span className="flex-1 text-[15px] font-medium text-slate-900 dark:text-white">Dark Mode</span>
                                <button
                                    role="switch"
                                    aria-checked={isDarkMode}
                                    onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
                                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 ${isDarkMode ? 'bg-purple-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                            {/* Security */}
                            <button onClick={() => setIsPasswordOpen(true)} className="w-full flex items-center px-4 py-3.5 gap-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors">
                                <div className="h-9 w-9 bg-green-50 dark:bg-green-950/30 rounded-full flex items-center justify-center shrink-0">
                                    <Lock size={18} className="text-green-600 dark:text-green-400" />
                                </div>
                                <span className="flex-1 text-left text-[15px] font-medium text-slate-900 dark:text-white">Security</span>
                                <ChevronRight size={18} className="text-slate-400 shrink-0" />
                            </button>
                            {/* Logout */}
                            <button onClick={handleLogout} className="w-full flex items-center px-4 py-3.5 gap-3 active:bg-red-50 dark:active:bg-red-950/20 transition-colors">
                                <div className="h-9 w-9 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center shrink-0">
                                    <LogOut size={18} className="text-red-500" />
                                </div>
                                <span className="flex-1 text-left text-[15px] font-medium text-red-600 dark:text-red-400">Logout</span>
                            </button>
                        </div>
                    </div>

                    {/* Team Management Section (manager only) */}
                    {isManager && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">Team Management</h3>
                            <div className="bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                                {/* Company Settings - opens bottom sheet with hubs + feature toggles */}
                                <button onClick={() => setIsCompanySettingsOpen(true)} className="w-full flex items-center px-4 py-3.5 gap-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors">
                                    <div className="h-9 w-9 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center shrink-0">
                                        <Building2 size={18} className="text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <span className="flex-1 text-left text-[15px] font-medium text-slate-900 dark:text-white">Company Settings</span>
                                    <ChevronRight size={18} className="text-slate-400 shrink-0" />
                                </button>
                                {/* Team & Dispatchers */}
                                <Link href="/dispatchers" className="flex items-center px-4 py-3.5 gap-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors">
                                    <div className="h-9 w-9 bg-emerald-50 dark:bg-emerald-950/30 rounded-full flex items-center justify-center shrink-0">
                                        <Users size={18} className="text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <span className="flex-1 text-[15px] font-medium text-slate-900 dark:text-white">Team & Dispatchers</span>
                                    <ChevronRight size={18} className="text-slate-400 shrink-0" />
                                </Link>
                                {/* Drivers Overview */}
                                <Link href="/drivers" className="flex items-center px-4 py-3.5 gap-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors">
                                    <div className="h-9 w-9 bg-orange-50 dark:bg-orange-950/30 rounded-full flex items-center justify-center shrink-0">
                                        <Truck size={18} className="text-orange-600 dark:text-orange-400" />
                                    </div>
                                    <span className="flex-1 text-[15px] font-medium text-slate-900 dark:text-white">Drivers Overview</span>
                                    <ChevronRight size={18} className="text-slate-400 shrink-0" />
                                </Link>
                            </div>
                        </div>
                    )}
                </main>

                {/* Change Password Sheet */}
                <Sheet open={isPasswordOpen} onOpenChange={(open) => {
                    setIsPasswordOpen(open)
                    if (!open) { setCurrentPassword(""); setNewPassword(""); setConfirmPassword("") }
                }}>
                    <SheetContent side="bottom" className="rounded-t-3xl shadow-2xl p-0 flex flex-col" hideClose>
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                        </div>
                        <div className="px-6 space-y-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}>
                            <SheetHeader className="p-0">
                                <SheetTitle className="text-xl font-bold text-slate-900 dark:text-white">Change Password</SheetTitle>
                                <SheetDescription className="sr-only">Update your account password</SheetDescription>
                            </SheetHeader>

                            <div className="space-y-5">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Current Password</label>
                                    <Input
                                        type="password"
                                        placeholder="Enter current password"
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                        className="h-12 rounded-xl"
                                    />
                                    <button
                                        onClick={() => {
                                            supabase.auth.resetPasswordForEmail(userEmail || '')
                                            toast({ title: "Password reset email sent", description: "Check your inbox", type: "success" })
                                        }}
                                        className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline mt-1"
                                    >
                                        Forgot your password?
                                    </button>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">New Password</label>
                                    <Input
                                        type="password"
                                        placeholder="Enter new password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        className="h-12 rounded-xl"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Confirm Password</label>
                                    <Input
                                        type="password"
                                        placeholder="Confirm new password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                            </div>

                            <Button
                                onClick={handleChangePassword}
                                disabled={changingPassword}
                                className="w-full h-12 rounded-xl text-[15px] font-bold gap-2 bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20"
                            >
                                <Lock size={16} />
                                {changingPassword ? "Changing..." : "Change Password"}
                            </Button>
                        </div>
                    </SheetContent>
                </Sheet>

                {/* Company Settings Sheet (hubs + feature toggles) */}
                <Sheet open={isCompanySettingsOpen} onOpenChange={setIsCompanySettingsOpen}>
                    <SheetContent side="bottom" className="h-[85vh] rounded-t-[32px] p-0 overflow-y-auto safe-area-pt bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border-t border-slate-200/50 dark:border-slate-800/50 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                        <div className="p-6 space-y-8">
                            <SheetHeader>
                                <SheetTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Company Settings</SheetTitle>
                                <SheetDescription className="text-slate-500 font-medium">Manage warehouses and feature toggles.</SheetDescription>
                            </SheetHeader>

                            {/* Warehouses Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-[16px] flex items-center justify-center shadow-inner shadow-blue-400/20">
                                            <Building2 size={20} strokeWidth={2.5} />
                                        </div>
                                        <h2 className="text-[17px] font-black text-slate-900 dark:text-white tracking-tight">Hubs & Depots</h2>
                                    </div>

                                    <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
                                        <SheetTrigger asChild>
                                            <Button size="sm" className="gap-2 h-10 rounded-[16px] px-4 shadow-sm bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 transition-all font-bold">
                                                <Plus size={16} strokeWidth={3} /> Add
                                            </Button>
                                        </SheetTrigger>
                                        <SheetContent side="bottom" className="h-[90vh] rounded-t-[32px] p-6 overflow-y-auto safe-area-pt bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border-t border-slate-200/50 dark:border-slate-800/50 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                                            <SheetHeader className="mb-6">
                                                <SheetTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Add New Warehouse</SheetTitle>
                                                <SheetDescription className="text-slate-500 font-medium">Define a new start location for your fleet.</SheetDescription>
                                            </SheetHeader>

                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Warehouse Name</label>
                                                    <Input
                                                        placeholder="e.g. Main HQ, North Depot"
                                                        value={newHubName}
                                                        onChange={e => setNewHubName(e.target.value)}
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Location</label>
                                                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                                        <LocationPicker
                                                            onLocationSelect={async (lat, lng) => {
                                                                setNewHubLoc({ lat, lng })
                                                                try {
                                                                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
                                                                    const data = await res.json()
                                                                    if (data && data.display_name) {
                                                                        setNewHubAddress(data.display_name)
                                                                    }
                                                                } catch (e) {
                                                                    // Silent fail
                                                                }
                                                            }}
                                                            initialPosition={newHubLoc}
                                                        />
                                                        {newHubLoc && (
                                                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1 font-medium">
                                                                <MapPin size={12} />
                                                                Pinned: {newHubLoc.lat.toFixed(5)}, {newHubLoc.lng.toFixed(5)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Full Address</label>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            placeholder="123 Industrial Blvd, City, State"
                                                            value={newHubAddress}
                                                            onChange={async (e) => {
                                                                setNewHubAddress(e.target.value)
                                                                const address = e.target.value
                                                                if (!address) return

                                                                setTimeout(async () => {
                                                                    if (address !== newHubAddress) return
                                                                    try {
                                                                        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
                                                                        const data = await res.json()
                                                                        if (data && data[0]) {
                                                                            setNewHubLoc({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
                                                                        }
                                                                    } catch (e) {
                                                                        // Silent fail
                                                                    }
                                                                }, 1000)
                                                            }}
                                                        />
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="shrink-0"
                                                            onClick={async () => {
                                                                if (!newHubAddress) return
                                                                try {
                                                                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newHubAddress)}`)
                                                                    const data = await res.json()
                                                                    if (data && data[0]) {
                                                                        setNewHubLoc({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
                                                                        toast({ title: "Location found!", description: "Map pin updated.", type: "success" })
                                                                    } else {
                                                                        toast({ title: "Address not found", description: "Please pick manually.", type: "error" })
                                                                    }
                                                                } catch (e) {
                                                                    toast({ title: "Search failed", type: "error" })
                                                                }
                                                            }}
                                                            title="Find on Map"
                                                        >
                                                            <Search size={18} />
                                                        </Button>
                                                    </div>
                                                </div>

                                                <Button onClick={handleAddHub} className="w-full h-12 text-lg font-bold" disabled={saving}>
                                                    {saving ? "Saving..." : "Add Warehouse"}
                                                </Button>

                                                <div className="h-8" />
                                            </div>
                                        </SheetContent>
                                    </Sheet>
                                </div>

                                {hubs.length === 0 ? (
                                    <div className="border-dashed border-2 border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 rounded-[24px] flex flex-col items-center justify-center py-12 text-center">
                                        <div className="h-14 w-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
                                            <Building2 className="h-7 w-7 text-slate-400 dark:text-slate-500" strokeWidth={2} />
                                        </div>
                                        <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-200">No hubs defined yet</h3>
                                        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-1 max-w-[240px]">Add a starting point for your drivers to optimize routing.</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-3">
                                        {hubs.map(hub => (
                                            <div key={hub.id} className="group relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-[20px] overflow-hidden">
                                                <div className="flex items-center p-4 gap-3">
                                                    <div className="h-11 w-11 bg-slate-50 dark:bg-slate-800 rounded-[14px] shadow-sm flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60">
                                                        <Building2 size={20} className="text-blue-600 dark:text-blue-400 opacity-90" strokeWidth={2} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-[15px] font-bold text-slate-900 dark:text-white truncate">{hub.name}</h3>
                                                        <div className="flex items-start gap-1 mt-0.5">
                                                            <MapPin size={12} className="flex-shrink-0 text-slate-400 mt-0.5" strokeWidth={2.5} />
                                                            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 line-clamp-1">{hub.address}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 h-10 w-10 flex items-center justify-center rounded-full transition-all flex-shrink-0"
                                                        onClick={() => handleDeleteHub(hub.id)}
                                                    >
                                                        <Trash2 size={18} strokeWidth={2} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Feature Toggles Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-[16px] flex items-center justify-center shadow-inner shadow-emerald-400/20">
                                        <Settings2 size={20} strokeWidth={2.5} />
                                    </div>
                                    <h2 className="text-[17px] font-black text-slate-900 dark:text-white tracking-tight">Features</h2>
                                </div>

                                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-[24px] overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {/* Weight Tracking */}
                                    <div className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded-[14px] shadow-sm flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60">
                                                <Weight size={18} className="text-emerald-600 dark:text-emerald-400 opacity-90" strokeWidth={2} />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">Weight Tracking</h3>
                                                <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Track order weight and capacity</p>
                                            </div>
                                        </div>
                                        <button
                                            role="switch"
                                            aria-checked={featureSettings.weight_tracking_enabled}
                                            disabled={savingFeatures}
                                            onClick={() => handleToggleFeature('weight_tracking_enabled')}
                                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${featureSettings.weight_tracking_enabled ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                                        >
                                            <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${featureSettings.weight_tracking_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>

                                    {/* Customer Tracking */}
                                    <div className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded-[14px] shadow-sm flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60">
                                                <MapPinned size={18} className="text-blue-600 dark:text-blue-400 opacity-90" strokeWidth={2} />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">Customer Tracking</h3>
                                                <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Tracking links for customers</p>
                                            </div>
                                        </div>
                                        <button
                                            role="switch"
                                            aria-checked={featureSettings.customer_tracking_enabled}
                                            disabled={savingFeatures}
                                            onClick={() => handleToggleFeature('customer_tracking_enabled')}
                                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${featureSettings.customer_tracking_enabled ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                                        >
                                            <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${featureSettings.customer_tracking_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>

                                    {/* Email Notifications */}
                                    <div className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded-[14px] shadow-sm flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60">
                                                <Mail size={18} className="text-violet-600 dark:text-violet-400 opacity-90" strokeWidth={2} />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">Email Notifications</h3>
                                                <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Email updates on delivery status</p>
                                            </div>
                                        </div>
                                        <button
                                            role="switch"
                                            aria-checked={featureSettings.customer_email_notifications}
                                            disabled={savingFeatures}
                                            onClick={() => handleToggleFeature('customer_email_notifications')}
                                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${featureSettings.customer_email_notifications ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                                        >
                                            <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${featureSettings.customer_email_notifications ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="h-8" />
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
        </PullToRefresh>
    )
}
