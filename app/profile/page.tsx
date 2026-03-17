"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase, type CustomField } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet"
import { Mail, Save, Truck, Building2, Camera, Edit2, Info, AlertTriangle, CreditCard, Crown, Users, Package, ChevronRight } from "lucide-react"
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
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)

    // User Info
    const [userId, setUserId] = useState('')
    const [userRole, setUserRole] = useState<string>('')
    const [email, setEmail] = useState('')
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')
    const [vehicleType, setVehicleType] = useState('')
    const [profileImage, setProfileImage] = useState<string | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)

    // Custom Fields
    const [customFields, setCustomFields] = useState<CustomField[]>([])
    const [customValues, setCustomValues] = useState<Record<string, string>>({})

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
                            .select('phone, vehicle_type, custom_values')
                            .eq('user_id', currentUserId)
                            .single()
                            .then(({ data }) => {
                                if (data) {
                                    setPhone(data.phone || '')
                                    setVehicleType(data.vehicle_type || '')
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
            <div className="min-h-screen bg-[#F2F2F7] dark:bg-black relative overflow-hidden pb-32">
                
                {/* Header */}
                <header className="px-5 pt-[max(1.5rem,env(safe-area-inset-top,1.5rem))] pb-3 flex items-center justify-between sticky top-0 z-50 bg-[#F2F2F7]/80 dark:bg-black/80 backdrop-blur-md">
                    <h1 className="text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">Profile</h1>
                </header>

                <main className="px-5 pt-4 space-y-6 max-w-lg mx-auto relative z-0">
                    
                    {/* iOS Style Profile Card (Apple ID style) */}
                    <div className="bg-white dark:bg-[#1C1C1E] rounded-[10px] shadow-sm border border-black/5 dark:border-white/10 overflow-hidden">
                        <div className="flex items-center p-4 relative group">
                            {/* Avatar */}
                            <div className="relative h-16 w-16 shrink-0">
                                <div className="h-full w-full rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                                    {imagePreview || profileImage ? (
                                        <img src={imagePreview || profileImage!} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        <span className="text-xl font-bold text-slate-400 dark:text-slate-500">{initials || 'D'}</span>
                                    )}
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingImage}
                                    className="absolute -bottom-1 -right-1 z-10 bg-blue-600 hover:bg-blue-700 rounded-full p-1.5 border-[2.5px] border-white dark:border-[#1C1C1E] shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                                >
                                    {uploadingImage ? (
                                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    ) : (
                                        <Camera size={10} className="text-white" fill="currentColor" />
                                    )}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                            </div>

                            {/* Name & Role */}
                            <div className="ml-4 flex-1">
                                <h2 className="text-[20px] font-semibold text-slate-900 dark:text-white tracking-tight leading-tight">
                                    {fullName || email.split('@')[0] || userRole || 'Driver'}
                                </h2>
                                <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    {email}
                                </p>
                                <div className="mt-1.5 flex items-center">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-[800] tracking-widest uppercase px-2 py-0.5 rounded-[6px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                                        {userRole === 'driver' ? <Truck size={10} /> : <Building2 size={10} />}
                                        <span className="mt-[1px]">{userRole || 'USER'}</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Subscription Card (managers only) */}
                    {userRole === 'manager' && subscriptionInfo && (
                        <div className="bg-white dark:bg-slate-900 rounded-[28px] shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 dark:border-slate-800 p-5">
                            <Link href="/subscribe" className="flex items-center gap-4 mb-5 group cursor-pointer active:scale-[0.98] transition-transform">
                                <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center">
                                    <CreditCard size={22} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[12px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Subscription</p>
                                    <p className="text-[16px] font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                        {subscriptionInfo.planName
                                            ? <><Crown size={16} className="text-amber-500" />{subscriptionInfo.planName} Plan</>
                                            : subscriptionInfo.isTrialActive
                                                ? `Free Trial — ${subscriptionInfo.daysRemaining} days left`
                                                : 'No Active Plan'
                                        }
                                    </p>
                                </div>
                                <span className="text-[12px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-3.5 py-2 rounded-full group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors">
                                    {subscriptionInfo.planName ? 'Manage' : 'Upgrade'}
                                </span>
                            </Link>

                            {/* Usage bars */}
                            <div className="space-y-4 mb-5">
                                <div>
                                    <div className="flex justify-between text-[13px] mb-1.5 font-medium">
                                        <span className="text-slate-500 flex items-center gap-1.5"><Users size={14} /> Drivers</span>
                                        <span className="font-bold text-slate-700 dark:text-slate-300">{subscriptionInfo.driversUsed} / {subscriptionInfo.driverLimit}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${subscriptionInfo.driversUsed >= subscriptionInfo.driverLimit ? 'bg-red-500' : 'bg-blue-500'}`}
                                            style={{ width: `${Math.min(100, (subscriptionInfo.driversUsed / subscriptionInfo.driverLimit) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[13px] mb-1.5 font-medium">
                                        <span className="text-slate-500 flex items-center gap-1.5"><Package size={14} /> Orders this month</span>
                                        <span className="font-bold text-slate-700 dark:text-slate-300">{subscriptionInfo.ordersUsedThisMonth} / {subscriptionInfo.orderLimit}</span>
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
                                <Button variant="outline" className="w-full h-12 rounded-2xl border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 font-bold text-[15px]">
                                    {subscriptionInfo.planName ? 'Manage Plan' : 'View Plans'}
                                </Button>
                            </Link>
                        </div>
                    )}

                    {/* Driver/Dispatcher subscription note */}
                    {(userRole === 'driver' || userRole === 'dispatcher') && (
                        <div className="bg-white dark:bg-slate-900 rounded-[28px] p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 dark:border-slate-800 flex items-center justify-center text-center">
                            <p className="text-[15px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed px-2">
                                Your company&apos;s subscription is managed by your account administrator.
                            </p>
                        </div>
                    )}

                    {/* Driver Custom Fields Card */}
                    {userRole === 'driver' && customFields.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-4 mb-5">
                                <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full flex items-center justify-center">
                                    <Info size={22} />
                                </div>
                                <div>
                                    <p className="text-[12px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Additional Info</p>
                                    <p className="text-[17px] font-bold text-slate-900 dark:text-white">Driver Details</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {customFields.map((field) => (
                                    <div key={field.id} className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0 last:pb-0">
                                        <span className="text-[15px] font-medium text-slate-500">{field.field_label}</span>
                                        <span className="text-[15px] font-bold text-slate-900 dark:text-white">
                                            {customValues[field.id] || '—'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                              {/* General Section */}
                    <div className="space-y-2 mt-6">
                        <h2 className="text-[13px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-4">Account Actions</h2>
                        <div className="bg-white dark:bg-slate-900 rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                            
                            {/* Edit Profile Sheet Trigger */}
                            <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
                                <SheetTrigger asChild>
                                    <button className="w-full flex items-center px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors active:bg-slate-100 dark:active:bg-slate-800">
                                        <div className="h-10 w-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center shrink-0 text-blue-500 dark:text-blue-400">
                                            <Edit2 size={20} className="stroke-[2.5px]" />
                                        </div>
                                        <div className="ml-4 flex-1 text-left">
                                            <p className="text-[16px] font-semibold text-slate-900 dark:text-white">Edit Profile</p>
                                            <p className="text-[14px] text-slate-500 dark:text-slate-400">Update your information</p>
                                        </div>
                                        <ChevronRight size={20} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                    </button>
                                </SheetTrigger>
                                <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-[32px] safe-area-pt bg-white dark:bg-slate-950 border-t border-slate-200/50 dark:border-slate-800/50 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                                    <SheetHeader className="mb-8 mt-2">
                                        <SheetTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Edit Profile</SheetTitle>
                                    </SheetHeader>
                                    <div className="space-y-6 px-2 pb-12">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Full Name</label>
                                            <Input
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                placeholder="Enter your name"
                                                className="h-14 rounded-[20px] bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-[16px] px-5"
                                            />
                                        </div>

                                        {userRole === 'driver' && (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Phone Number</label>
                                                    <StyledPhoneInput
                                                        value={phone}
                                                        onChange={(val) => setPhone(val || '')}
                                                        placeholder="e.g. +1 234 567 8900"
                                                        defaultCountry="US"
                                                        className="bg-slate-50 dark:bg-slate-900/50 rounded-[20px] [&_.PhoneInputInput]:h-14 [&_.PhoneInputInput]:text-[16px] [&_.PhoneInputInput]:px-5 [&_.PhoneInputCountry]:pl-5"
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Vehicle Type</label>
                                                    <Input
                                                        value={vehicleType}
                                                        onChange={(e) => setVehicleType(e.target.value)}
                                                        placeholder="e.g. Van, Truck"
                                                        className="h-14 rounded-[20px] bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-[16px] px-5"
                                                    />
                                                </div>

                                                {/* Dynamic Fields in Edit Sheet */}
                                                {customFields.length > 0 && (
                                                    <div className="space-y-5 pt-8 mt-4 border-t border-slate-100 dark:border-slate-800">
                                                        <h4 className="font-black tracking-tight text-[18px] text-slate-900 dark:text-white ml-1">Additional Details</h4>
                                                        {customFields.map((field) => (
                                                            <div key={field.id} className="space-y-2">
                                                                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">{field.field_label}</label>
                                                                {field.field_type === 'select' ? (
                                                                    <select
                                                                        value={customValues[field.id] || ''}
                                                                        onChange={(e) => setCustomValues({ ...customValues, [field.id]: e.target.value })}
                                                                        className="flex h-14 w-full rounded-[20px] border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-5 py-2 text-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
                                                                        className="h-14 rounded-[20px] bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-[16px] px-5"
                                                                    />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        <div className="pt-4 pb-8">
                                            <Button
                                                onClick={handleUpdateProfile}
                                                disabled={saving}
                                                className="w-full h-[60px] text-[18px] font-bold rounded-[20px] bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all"
                                            >
                                                {saving ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-5 w-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Saving...
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <Save size={22} className="stroke-[2.5px]" />
                                                        Save Changes
                                                    </div>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="space-y-2 pt-4">
                        <div className="pl-4">
                            <h2 className="text-[12px] font-[900] text-[#FF4C51] uppercase tracking-[0.22em] mb-3 text-center">Danger Zone</h2>
                        </div>
                        <div className="bg-transparent rounded-[24px]">
                            <Sheet>
                                <SheetTrigger asChild>
                                    <button
                                        className="w-full flex items-center justify-center py-4 bg-transparent hover:bg-rose-50 dark:hover:bg-rose-950/20 text-[#FF4C51] text-[16px] font-[800] rounded-[22px] border-[1.5px] border-dashed border-[#FFB2B4] dark:border-rose-900/50 transition-colors"
                                    >
                                        Delete My Account
                                    </button>
                                </SheetTrigger>
                                <SheetContent side="bottom" className="rounded-t-[32px] safe-area-pt bg-white dark:bg-slate-950 border-t border-rose-200/50 dark:border-rose-900/50 shadow-[0_-10px_40px_rgba(225,50,50,0.1)]">
                                    <SheetHeader className="mb-6 space-y-4">
                                        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-[#FF4C51] rounded-full flex items-center justify-center mx-auto mb-2 mt-2">
                                            <AlertTriangle size={32} strokeWidth={2.5} />
                                        </div>
                                        <SheetTitle className="text-[24px] font-[900] tracking-tight text-slate-900 dark:text-white text-center">Delete Account</SheetTitle>
                                        <SheetDescription className="text-center text-slate-500 dark:text-slate-400 text-[15.5px] leading-relaxed max-w-[280px] mx-auto">
                                            This action is <span className="font-bold text-[#FF4C51] dark:text-rose-400">permanent and cannot be undone</span>. All your data, drivers, and settings will be wiped.
                                        </SheetDescription>
                                    </SheetHeader>

                                    <div className="space-y-6 px-2 pb-12">
                                        <div className="bg-rose-50/50 dark:bg-rose-950/20 p-5 rounded-[20px] border border-rose-100 dark:border-rose-900/30 space-y-3">
                                            <label className="text-[14px] font-bold text-slate-700 dark:text-slate-300 text-center block">
                                                Please type <span className="font-mono bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg text-[#FF4C51] select-all border border-rose-200 dark:border-rose-800/50 ml-1 shadow-sm">DELETE</span> to confirm
                                            </label>
                                            <Input
                                                id="delete-confirm-input"
                                                placeholder="Type DELETE here..."
                                                className="h-[52px] rounded-[16px] bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-800 text-[16px] shadow-sm text-center font-bold focus-visible:ring-[#FF4C51] font-mono tracking-widest uppercase mt-4"
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
                                            className="w-full h-14 bg-[#FF4C51] hover:bg-rose-600 text-white font-[800] text-[17px] rounded-full shadow-lg shadow-rose-500/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 disabled:shadow-none mt-4"
                                        >
                                            Permanently Delete
                                        </Button>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </div>

                    {/* Legal Footer */}
                    <div className="text-center pt-4 space-y-3 pb-8">
                        <div className="flex items-center justify-center gap-4 text-[13px] font-bold text-blue-600 dark:text-blue-400">
                            <a href="/privacy" className="hover:underline opacity-80 hover:opacity-100">Privacy Policy</a>
                            <span className="opacity-40">•</span>
                            <a href="/terms" className="hover:underline opacity-80 hover:opacity-100">Terms of Service</a>
                        </div>
                        <p className="text-[12px] font-medium text-slate-400">
                            Raute v1.0.0 • Image max 2MB 📸
                        </p>
                    </div>
                </main>
            </div>
        </PullToRefresh>
    )
}
