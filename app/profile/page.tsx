"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase, type CustomField } from "@/lib/supabase"
import { isDriverOnline } from "@/lib/driver-status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet"
import { User, Mail, Lock, LogOut, Save, Truck, Building2, Camera, Edit2, Upload, X, Info, AlertTriangle, CreditCard, Crown, Users, Package } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { StyledPhoneInput } from "@/components/ui/styled-phone-input"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/toast-provider"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { authenticatedFetch } from "@/lib/authenticated-fetch"
import { markIntentionalLogout } from "@/components/auth-check"

export default function ProfilePage() {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { toast } = useToast()

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploadingImage, setUploadingImage] = useState(false)
    const [changingPassword, setChangingPassword] = useState(false)
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
    const [isPasswordSheetOpen, setIsPasswordSheetOpen] = useState(false)

    // User Info
    const [userId, setUserId] = useState('')
    const [userRole, setUserRole] = useState<string>('')
    const [email, setEmail] = useState('')
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')
    const [vehicleType, setVehicleType] = useState('')
    const [companyName, setCompanyName] = useState('')
    const [isOnline, setIsOnline] = useState(false)
    const [profileImage, setProfileImage] = useState<string | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)

    // Custom Fields
    const [customFields, setCustomFields] = useState<CustomField[]>([])
    const [customValues, setCustomValues] = useState<Record<string, any>>({})

    // Subscription Info (managers only)
    const [subscriptionInfo, setSubscriptionInfo] = useState<{
        planName: string | null
        driverLimit: number
        orderLimit: number
        trialEndsAt: string | null
        isTrialActive: boolean
        daysRemaining: number
        driversUsed: number
        ordersUsedThisMonth: number
    } | null>(null)

    // Password Change
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    useEffect(() => {
        fetchProfile()
    }, [])

    async function fetchProfile() {
        try {
            setLoading(true)

            // 1. Try standard Supabase Auth
            let currentUserId = null
            let currentUserEmail = ''

            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                currentUserId = user.id
                currentUserEmail = user.email || ''
            }

            if (!currentUserId) {
                // Don't redirect here — AuthCheck already handles auth redirects.
                // Redirecting here causes a race condition where both AuthCheck and
                // this page compete to redirect, potentially causing navigation loops.
                return
            }

            setUserId(currentUserId)
            setEmail(currentUserEmail)

            const { data: userProfile, error: profileError } = await supabase
                .from('users')
                .select('full_name, role, company_id, profile_image, email, driver_limit, order_limit, trial_ends_at')
                .eq('id', currentUserId)
                .single()

            if (profileError) {
                console.error('❌ Profile query failed:', profileError.message, '| User ID:', currentUserId)
            }

            let profileData = userProfile

            // FALLBACK: If direct query failed, use server-side API
            if (!profileData) {
                try {
                    const res = await authenticatedFetch('/api/user-profile')
                    if (res.ok) {
                        const apiData = await res.json()
                        if (apiData.success && apiData.user) {
                            profileData = apiData.user
                        }
                    }
                } catch (apiErr) {
                }
            }

            if (profileData) {
                setUserRole(profileData.role)
                setFullName(profileData.full_name || '')
                setProfileImage(profileData.profile_image)
                if (profileData.email) setEmail(profileData.email)

                // Parallel Fetching for details
                const promises = []

                // 1. Company Info
                if (profileData.company_id) {
                    promises.push(
                        supabase.from('companies').select('name').eq('id', profileData.company_id).single()
                            .then(({ data }) => { if (data) setCompanyName(data.name) })
                    )

                    // 2. Custom Fields (only if driver visible)
                    promises.push(
                        supabase.from('custom_fields')
                            .select('*')
                            .eq('company_id', profileData.company_id)
                            .eq('entity_type', 'driver')
                            .eq('driver_visible', true)
                            .order('display_order', { ascending: true })
                            .then(({ data }) => { setCustomFields(data || []) })
                    )

                    // 3. Subscription info (managers only)
                    if (profileData.role === 'manager') {
                        promises.push(
                            (async () => {
                                // Get active subscription
                                const { data: activeSub } = await supabase
                                    .from('subscription_history')
                                    .select('tier_name')
                                    .eq('user_id', currentUserId)
                                    .eq('is_active', true)
                                    .limit(1)
                                    .single()

                                // Count active drivers
                                const { count: driversCount } = await supabase
                                    .from('drivers')
                                    .select('id', { count: 'exact', head: true })
                                    .eq('company_id', profileData.company_id)
                                    .eq('status', 'active')

                                // Count orders this month
                                const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
                                const { count: ordersCount } = await supabase
                                    .from('orders')
                                    .select('id', { count: 'exact', head: true })
                                    .eq('company_id', profileData.company_id)
                                    .gte('created_at', monthStart)

                                const trialEndsAt = profileData.trial_ends_at ? new Date(profileData.trial_ends_at) : null
                                const now = new Date()
                                const isTrialActive = trialEndsAt ? now < trialEndsAt && !activeSub : false
                                const daysRemaining = trialEndsAt
                                    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
                                    : 0

                                // Format plan name
                                let planName = null
                                if (activeSub?.tier_name) {
                                    const name = activeSub.tier_name
                                        .replace('raute_', '').replace('stripe_', '')
                                        .replace('_monthly', '').replace('_annual', '')
                                    planName = name.charAt(0).toUpperCase() + name.slice(1)
                                }

                                setSubscriptionInfo({
                                    planName,
                                    driverLimit: profileData.driver_limit || 5,
                                    orderLimit: profileData.order_limit || 500,
                                    trialEndsAt: profileData.trial_ends_at,
                                    isTrialActive,
                                    daysRemaining,
                                    driversUsed: driversCount || 0,
                                    ordersUsedThisMonth: ordersCount || 0,
                                })
                            })()
                        )
                    }
                }

                // 3. Driver Data
                if (profileData.role === 'driver') {
                    promises.push(
                        supabase.from('drivers')
                            .select('phone, vehicle_type, is_online, last_location_update, custom_values')
                            .eq('user_id', currentUserId)
                            .single()
                            .then(({ data }) => {
                                if (data) {
                                    setPhone(data.phone || '')
                                    setVehicleType(data.vehicle_type || '')
                                    setIsOnline(isDriverOnline(data))
                                    setCustomValues(data.custom_values || {})
                                }
                            })
                    )
                }

                await Promise.all(promises)
            }
        } catch (error) {
            toast({ title: 'Error loading profile', type: 'error' })
        } finally {
            setLoading(false)
        }
    }

    async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            toast({ title: '❌ Image size must be less than 2MB', type: 'error' })
            return
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast({ title: '❌ Please select a valid image file', type: 'error' })
            return
        }

        try {
            setUploadingImage(true)

            // Create image preview
            const reader = new FileReader()
            reader.onloadend = () => {
                setImagePreview(reader.result as string)
            }
            reader.readAsDataURL(file)

            //Import compression utility
            const { ImageCompressor } = await import('@/lib/image-compressor')

            // Compress image (optimized for avatars)
            const blob = new Blob([await file.arrayBuffer()], { type: file.type })
            const compressedBlob = await ImageCompressor.compressFromBlob(blob)

            const fileName = `${userId}-${Date.now()}.jpg`
            const filePath = `avatars/${fileName}`

            // Delete old image if exists
            if (profileImage) {
                const oldPath = profileImage.split('/').pop()
                if (oldPath) {
                    await supabase.storage.from('profiles').remove([`avatars/${oldPath}`])
                }
            }

            // Upload compressed version
            const { error: uploadError } = await supabase.storage
                .from('profiles')
                .upload(filePath, compressedBlob, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg'
                })

            if (uploadError) throw uploadError

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('profiles')
                .getPublicUrl(filePath)

            // Update database
            const { error: updateError } = await supabase
                .from('users')
                .update({ profile_image: publicUrl })
                .eq('id', userId)

            if (updateError) throw updateError

            setProfileImage(publicUrl)
            toast({ title: '✅ Profile picture updated!', type: 'success' })
        } catch (error) {
            toast({ title: 'Error uploading image', type: 'error' })
        } finally {
            setUploadingImage(false)
        }
    }

    async function handleUpdateProfile() {
        try {
            setSaving(true)

            const { error: userError } = await supabase
                .from('users')
                .update({ full_name: fullName })
                .eq('id', userId)

            if (userError) throw userError

            if (userRole === 'driver') {
                const { error: driverError } = await supabase
                    .from('drivers')
                    .update({
                        phone: phone || null,
                        vehicle_type: vehicleType || null,
                        name: fullName,
                        custom_values: customValues
                    })
                    .eq('user_id', userId)

                if (driverError) throw driverError
            }

            toast({ title: '✅ Profile updated successfully!', type: 'success' })
            setIsEditSheetOpen(false)
        } catch (error) {
            toast({ title: 'Error updating profile', type: 'error' })
        } finally {
            setSaving(false)
        }
    }

    async function handleChangePassword() {
        if (newPassword !== confirmPassword) {
            toast({ title: '❌ Passwords do not match!', type: 'error' })
            return
        }

        if (newPassword.length < 8) {
            toast({ title: '❌ Password must be at least 8 characters', type: 'error' })
            return
        }

        try {
            setChangingPassword(true)

            const { error } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (error) throw error

            toast({ title: '✅ Password changed successfully!', type: 'success' })
            setNewPassword('')
            setConfirmPassword('')
            setIsPasswordSheetOpen(false)
        } catch (error) {
            toast({ title: 'Error changing password', type: 'error' })
        } finally {
            setChangingPassword(false)
        }
    }

    async function handleLogout() {
        if (!confirm('Are you sure you want to logout?')) return

        try {
            markIntentionalLogout()
            await supabase.auth.signOut()
            router.push('/login')
        } catch (error) {
            toast({ title: 'Log out failed', type: 'error' })
            router.push('/login')
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <div className="relative bg-gradient-to-br from-slate-200 via-slate-300 to-slate-200 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 pb-24 px-4" style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 1.5rem)` }}>
                    <div className="flex flex-col items-center text-center space-y-4">
                        <Skeleton className="h-24 w-24 rounded-full border-4 border-background" />
                        <div className="space-y-2 flex flex-col items-center">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-8 w-24 rounded-full" />
                        </div>
                    </div>
                </div>
                <div className="relative z-10 max-w-lg mx-auto px-4 -mt-12 space-y-4">
                    <Skeleton className="h-24 w-full rounded-2xl shadow-lg" />
                    <Skeleton className="h-32 w-full rounded-2xl shadow-lg" />
                    <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-28 rounded-2xl" />
                        <Skeleton className="h-28 rounded-2xl" />
                    </div>
                </div>
            </div>
        )
    }

    const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

    return (
        <PullToRefresh onRefresh={fetchProfile}>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
                {/* Decorative Ambient Backgrounds */}
                <div className="absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-blue-500/10 via-indigo-500/5 to-transparent pointer-events-none" />
                <div className="fixed -top-32 -right-32 w-[500px] h-[500px] bg-blue-400/20 dark:bg-blue-600/10 rounded-full blur-[80px] pointer-events-none" />
                <div className="fixed top-40 -left-32 w-[400px] h-[400px] bg-indigo-400/20 dark:bg-indigo-600/10 rounded-full blur-[80px] pointer-events-none" />

                {/* Modern Minimalist Header */}
                <div className="pb-6 px-4 safe-area-pt relative z-10" style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 1.5rem)` }}>
                    <div className="max-w-lg mx-auto bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 shadow-xl shadow-slate-200/50 dark:shadow-none rounded-[2.5rem] p-8 pt-10 relative overflow-hidden">
                        {/* Inner Gradient Gloss */}
                        <div className="absolute top-0 left-0 w-full h-[150px] bg-gradient-to-b from-white/60 to-transparent dark:from-white/5 pointer-events-none" />

                        <div className="flex flex-col items-center justify-center text-center space-y-6 relative z-10">
                            {/* Avatar Container with Glassy Glow */}
                            <div className="relative group">
                                <div className="absolute inset-0 bg-blue-500/30 dark:bg-blue-400/20 blur-2xl rounded-full scale-[1.2]" />
                                <div className="relative h-32 w-32 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] border border-slate-100 dark:border-slate-800 overflow-hidden ring-4 ring-white dark:ring-slate-900">
                                    {imagePreview || profileImage ? (
                                        <img src={imagePreview || profileImage!} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        <span className="text-4xl font-bold text-slate-300 dark:text-slate-600">{initials || '👤'}</span>
                                    )}
                                </div>

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingImage}
                                    className="absolute bottom-0 right-0 h-10 w-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 border-[3px] border-white dark:border-slate-900 disabled:opacity-50"
                                >
                                    {uploadingImage ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    ) : (
                                        <Camera size={18} strokeWidth={2.5} />
                                    )}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                                {userRole === 'driver' && (
                                    <div className={`absolute top-2 right-2 h-5 w-5 rounded-full border-[3px] border-white dark:border-slate-900 shadow-sm ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                                        <div className={`h-full w-full rounded-full ${isOnline ? 'animate-pulse bg-emerald-400' : ''}`} />
                                    </div>
                                )}
                            </div>

                            {/* User Info Details */}
                            <div className="space-y-2">
                                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                                    {fullName || email.split('@')[0] || userRole || 'User'}
                                </h1>
                                <div className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-800/50 py-1 px-3 rounded-full border border-slate-200/50 dark:border-slate-700/50 mx-auto w-fit">
                                    <Mail size={14} />
                                    <span className="text-[13px] font-semibold">{email}</span>
                                </div>
                            </div>

                            {/* Role Badge - Re-designed */}
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-blue-500/20">
                                {userRole === 'driver' ? <Truck size={16} /> : <Building2 size={16} />}
                                <span className="text-[12px] font-black uppercase tracking-widest">{userRole ? userRole : 'No Role'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Container */}
                <div className="max-w-lg mx-auto px-4 pb-32 space-y-4 relative z-10">

                    {/* Subscription Card (managers only) */}
                    {userRole === 'manager' && subscriptionInfo && (
                        <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/50 dark:border-slate-800/50 p-5">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-10 w-10 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
                                    <CreditCard size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Subscription</p>
                                    <p className="text-base font-bold text-slate-900 dark:text-white">
                                        {subscriptionInfo.planName
                                            ? <span className="flex items-center gap-1.5"><Crown size={14} className="text-amber-500" />{subscriptionInfo.planName} Plan</span>
                                            : subscriptionInfo.isTrialActive
                                                ? `Free Trial — ${subscriptionInfo.daysRemaining} day${subscriptionInfo.daysRemaining === 1 ? '' : 's'} left`
                                                : 'No Active Plan'
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Usage bars */}
                            <div className="space-y-3 mb-4">
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500 flex items-center gap-1"><Users size={12} /> Drivers</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{subscriptionInfo.driversUsed} / {subscriptionInfo.driverLimit}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${subscriptionInfo.driversUsed >= subscriptionInfo.driverLimit ? 'bg-red-500' : 'bg-blue-500'}`}
                                            style={{ width: `${Math.min(100, (subscriptionInfo.driversUsed / subscriptionInfo.driverLimit) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500 flex items-center gap-1"><Package size={12} /> Orders this month</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{subscriptionInfo.ordersUsedThisMonth} / {subscriptionInfo.orderLimit}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${subscriptionInfo.ordersUsedThisMonth >= subscriptionInfo.orderLimit ? 'bg-red-500' : 'bg-green-500'}`}
                                            style={{ width: `${Math.min(100, (subscriptionInfo.ordersUsedThisMonth / subscriptionInfo.orderLimit) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <Link href="/subscribe">
                                <Button variant="outline" className="w-full h-11 rounded-xl border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 font-semibold">
                                    {subscriptionInfo.planName ? 'Manage Plan' : 'View Plans'}
                                </Button>
                            </Link>
                        </div>
                    )}

                    {/* Driver/Dispatcher subscription note */}
                    {(userRole === 'driver' || userRole === 'dispatcher') && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                            <p className="text-xs text-slate-500 text-center">Your company's subscription is managed by your account administrator.</p>
                        </div>
                    )}

                    {/* Driver Custom Fields Card */}
                    {userRole === 'driver' && customFields.length > 0 && (
                        <div className="bg-card text-card-foreground rounded-2xl shadow-lg border border-border p-5">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="h-12 w-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                                    <Info size={24} />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Additional Info</p>
                                    <p className="text-lg font-bold text-foreground">Driver Details</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {customFields.map((field) => (
                                    <div key={field.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                                        <span className="text-sm text-muted-foreground">{field.field_label}</span>
                                        <span className="text-sm font-medium text-foreground">
                                            {customValues[field.id] || '—'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="pt-2">
                        {/* Edit Profile Sheet */}
                        <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
                            <SheetTrigger asChild>
                                <Button className="w-full h-20 flex items-center justify-between px-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl hover:bg-white/80 dark:hover:bg-slate-800/80 text-foreground border border-white/50 dark:border-slate-700/50 shadow-sm shadow-blue-500/5 rounded-3xl transition-all active:scale-[0.98] group">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Edit2 size={22} strokeWidth={2.5} />
                                        </div>
                                        <div className="flex flex-col items-start gap-0.5">
                                            <span className="font-bold text-[17px] text-slate-800 dark:text-white">Edit Profile</span>
                                            <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Update your information</span>
                                        </div>
                                    </div>
                                    <div className="h-8 w-8 rounded-full bg-slate-100/50 dark:bg-slate-800/50 flex items-center justify-center">
                                        <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                        </span>
                                    </div>
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-[32px] safe-area-pt bg-white/95 dark:bg-slate-950/95 backdrop-blur-3xl border-t border-slate-200/50 dark:border-slate-800/50 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                                <SheetHeader className="mb-8">
                                    <SheetTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mt-2">Edit Profile</SheetTitle>
                                </SheetHeader>
                                <div className="space-y-6 px-2 pb-12">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Full Name</label>
                                        <Input
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Enter your name"
                                            className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-[16px] shadow-sm"
                                        />
                                    </div>

                                    {userRole === 'driver' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Phone Number</label>
                                                <StyledPhoneInput
                                                    value={phone}
                                                    onChange={(val) => setPhone(val || '')}
                                                    placeholder="e.g. +1 234 567 8900"
                                                    defaultCountry="US"
                                                    className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl shadow-sm [&_.PhoneInputInput]:h-14 [&_.PhoneInputInput]:text-[16px]"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Vehicle Type</label>
                                                <Input
                                                    value={vehicleType}
                                                    onChange={(e) => setVehicleType(e.target.value)}
                                                    placeholder="e.g. Van, Truck"
                                                    className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-[16px] shadow-sm"
                                                />
                                            </div>

                                            {/* Dynamic Fields in Edit Sheet */}
                                            {customFields.length > 0 && (
                                                <div className="space-y-5 pt-6 border-t border-slate-200 dark:border-slate-800">
                                                    <h4 className="font-black tracking-tight text-[17px] text-slate-900 dark:text-white">Additional Details</h4>
                                                    {customFields.map((field) => (
                                                        <div key={field.id} className="space-y-2">
                                                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{field.field_label}</label>
                                                            {field.field_type === 'select' ? (
                                                                <select
                                                                    value={customValues[field.id] || ''}
                                                                    onChange={(e) => setCustomValues({ ...customValues, [field.id]: e.target.value })}
                                                                    className="flex h-14 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-2 text-[16px] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-sm"
                                                                >
                                                                    <option value="">Select...</option>
                                                                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                </select>
                                                            ) : (
                                                                <Input
                                                                    value={customValues[field.id] || ''}
                                                                    onChange={(e) => setCustomValues({ ...customValues, [field.id]: e.target.value })}
                                                                    placeholder={field.placeholder || ''}
                                                                    type={field.field_type === 'number' ? 'number' : 'text'}
                                                                    className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-[16px] shadow-sm"
                                                                />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <Button
                                        onClick={handleUpdateProfile}
                                        disabled={saving}
                                        className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl shadow-md shadow-blue-500/20 mt-8"
                                    >
                                        <Save size={20} className="mr-2" />
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>

                    {/* DANGER ZONE */}
                    <div className="pt-12 pb-4">
                        <div className="flex flex-col items-center">
                            <p className="text-[11px] font-black text-rose-500/80 uppercase tracking-[0.15em] mb-4">Danger Zone</p>

                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="w-[85%] mx-auto h-14 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 text-[15px] font-bold rounded-2xl border border-dashed border-rose-200 dark:border-rose-900/50 shadow-sm"
                                    >
                                        Delete My Account
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="bottom" className="rounded-t-[32px] safe-area-pt bg-white/95 dark:bg-slate-950/95 backdrop-blur-3xl border-t border-rose-200/50 dark:border-rose-900/50 shadow-[0_-10px_40px_rgba(225,29,72,0.1)]">
                                    <SheetHeader className="mb-6 space-y-3">
                                        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto mb-2">
                                            <AlertTriangle size={32} strokeWidth={2.5} />
                                        </div>
                                        <SheetTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white text-center">Delete Account</SheetTitle>
                                        <SheetDescription className="text-center text-slate-500 dark:text-slate-400 text-[15px]">
                                            This action is <span className="font-bold text-rose-600 dark:text-rose-400">permanent and cannot be undone</span>. All your data, drivers, and settings will be wiped.
                                        </SheetDescription>
                                    </SheetHeader>

                                    <div className="space-y-6 px-2 pb-32">
                                        <div className="bg-rose-50/50 dark:bg-rose-950/20 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/30 space-y-3">
                                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 text-center block">
                                                Please type <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded text-rose-600 select-all border border-rose-200 dark:border-rose-800">DELETE</span> to confirm
                                            </label>
                                            <Input
                                                id="delete-confirm-input"
                                                placeholder="Type DELETE here..."
                                                className="h-14 rounded-xl bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-800 text-[16px] shadow-sm text-center font-bold focus-visible:ring-rose-500 font-mono tracking-widest uppercase"
                                                onChange={(e) => {
                                                    const btn = document.getElementById('confirm-delete-btn') as HTMLButtonElement;
                                                    if (btn) {
                                                        btn.disabled = e.target.value !== 'DELETE';
                                                    }
                                                }}
                                            />
                                        </div>

                                        <Button
                                            id="confirm-delete-btn"
                                            disabled={true}
                                            onClick={async () => {
                                                try {
                                                    setLoading(true);
                                                    const res = await authenticatedFetch('/api/auth/delete-account', {
                                                        method: 'DELETE',
                                                    });

                                                    if (!res.ok) throw new Error("Deletion failed");

                                                    markIntentionalLogout();
                                                    await supabase.auth.signOut();
                                                    router.push('/login');
                                                    toast({ title: 'Account deleted successfully', type: 'success' });
                                                } catch (e) {
                                                    toast({ title: 'Failed to delete account', type: 'error' });
                                                    setLoading(false);
                                                }
                                            }}
                                            className="w-full h-14 bg-rose-600 hover:bg-rose-700 text-white font-bold text-lg rounded-2xl shadow-lg shadow-rose-500/20 transition-all disabled:opacity-50 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                                        >
                                            Permanently Delete
                                        </Button>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </div>

                    {/* Legal Footer */}
                    <div className="text-center pt-8 pb-4 space-y-2">
                        <div className="flex items-center justify-center gap-4 text-xs font-medium text-blue-600 dark:text-blue-400">
                            <a href="/privacy" className="hover:underline">Privacy Policy</a>
                            <span>•</span>
                            <a href="/terms" className="hover:underline">Terms of Service</a>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Raute v1.0.0 • Image max 2MB 📸
                        </p>
                    </div>
                </div>
            </div>
        </PullToRefresh>
    )
}
