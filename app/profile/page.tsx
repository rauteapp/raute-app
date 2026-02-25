"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase, type CustomField } from "@/lib/supabase"
import { isDriverOnline } from "@/lib/driver-status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { User, Mail, Lock, LogOut, Save, Truck, Building2, Camera, Edit2, Upload, X, Info } from "lucide-react"
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
                console.warn('⚠️ Profile: no user found, waiting for AuthCheck to handle redirect')
                return
            }

            setUserId(currentUserId)
            setEmail(currentUserEmail)

            const { data: userProfile, error: profileError } = await supabase
                .from('users')
                .select('full_name, role, company_id, profile_image, email')
                .eq('id', currentUserId)
                .single()

            if (profileError) {
                console.error('❌ Profile query failed:', profileError.message, '| User ID:', currentUserId)
            }

            let profileData = userProfile

            // FALLBACK: If direct query failed, use server-side API
            if (!profileData) {
                console.warn('⚠️ Trying fallback API for profile...')
                try {
                    const res = await authenticatedFetch('/api/user-profile')
                    if (res.ok) {
                        const apiData = await res.json()
                        if (apiData.success && apiData.user) {
                            profileData = apiData.user
                            console.log('✅ Fallback API succeeded:', apiData.user.role)
                        }
                    }
                } catch (apiErr) {
                    console.warn('⚠️ Fallback API also failed:', apiErr)
                }
            }

            if (profileData) {
                console.log('✅ Profile loaded:', { role: profileData.role, company_id: profileData.company_id })
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
            <div className="min-h-screen bg-background">
                {/* Gradient Header */}
                <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 pb-24 px-4 safe-area-pt" style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 1.5rem)` }}>
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
                    </div>

                    <div className="relative max-w-lg mx-auto">
                        <div className="flex flex-col items-center text-center">
                            {/* Avatar */}
                            <div className="relative group">
                                <div className="h-24 w-24 bg-white rounded-full flex items-center justify-center shadow-xl border-4 border-white/20 backdrop-blur-sm overflow-hidden">
                                    {imagePreview || profileImage ? (
                                        <img src={imagePreview || profileImage!} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        <span className="text-3xl font-bold text-blue-600">{initials || '👤'}</span>
                                    )}
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingImage}
                                    className="absolute bottom-0 right-0 h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-400 transition-colors border-2 border-white disabled:opacity-50"
                                >
                                    {uploadingImage ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    ) : (
                                        <Camera size={16} className="text-white" />
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
                                    <div className={`absolute -top-1 -right-1 h-6 w-6 rounded-full border-2 border-white shadow-lg ${isOnline ? 'bg-green-500' : 'bg-slate-400'}`}>
                                        <div className={`h-full w-full rounded-full ${isOnline ? 'animate-pulse bg-green-400' : ''}`} />
                                    </div>
                                )}
                            </div>

                            <h1 className="text-3xl font-bold text-white mt-4 mb-2">
                                {fullName || email.split('@')[0] || userRole || 'User'}
                            </h1>
                            <div className="flex items-center gap-2 text-blue-100 text-sm mb-3">
                                <Mail size={14} />
                                <span>{email}</span>
                            </div>

                            <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-bold uppercase tracking-wider border border-white/30 shadow-lg">
                                {userRole === 'driver' ? <Truck size={14} /> : <Building2 size={14} />}
                                {userRole ? userRole : 'No Role'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Content Container - Added relative z-10 to sit ABOVE header */}
                <div className="relative z-10 max-w-lg mx-auto px-4 -mt-12 pb-4 space-y-4">
                    {/* Company Card */}
                    {companyName && (
                        <div className="bg-card text-card-foreground rounded-2xl shadow-lg border border-border p-5">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-blue-50/10 dark:bg-blue-900/20 text-blue-600 rounded-xl flex items-center justify-center">
                                    <Building2 size={24} />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Company</p>
                                    <p className="text-lg font-bold text-foreground">{companyName}</p>
                                </div>
                                {/* Settings Link for Managers */}
                                {userRole === 'manager' && (
                                    <Button
                                        className="ml-auto"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => router.push('/settings')}
                                    >
                                        Settings
                                    </Button>
                                )}
                            </div>
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

                    {/* Appearance Settings Card */}
                    <div className="bg-card text-card-foreground rounded-2xl shadow-lg border border-border p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Appearance</p>
                                <p className="text-lg font-bold text-foreground">Theme Settings</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted rounded-xl">
                            <div>
                                <p className="text-sm font-medium text-foreground">Dark Mode</p>
                                <p className="text-xs text-muted-foreground">Switch between light and dark theme</p>
                            </div>
                            <ThemeToggle />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Edit Profile Sheet */}
                        <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
                            <SheetTrigger asChild>
                                <Button className="h-28 flex flex-col items-center justify-center gap-2 bg-card hover:bg-muted text-foreground border border-border shadow-sm rounded-2xl transition-all active:scale-95 group">
                                    <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Edit2 size={20} />
                                    </div>
                                    <span className="font-semibold">Edit Profile</span>
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-3xl safe-area-pt">
                                <SheetHeader className="mb-6">
                                    <SheetTitle>Edit Profile</SheetTitle>
                                </SheetHeader>
                                <div className="space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-foreground">Full Name</label>
                                        <Input
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Enter your name"
                                            className="h-12 rounded-xl bg-background"
                                        />
                                    </div>

                                    {userRole === 'driver' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-foreground">Phone Number</label>
                                                <StyledPhoneInput
                                                    value={phone}
                                                    onChange={(val) => setPhone(val || '')}
                                                    placeholder="e.g. +1 234 567 8900"
                                                    defaultCountry="US"
                                                    className="bg-background rounded-xl"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-foreground">Vehicle Type</label>
                                                <Input
                                                    value={vehicleType}
                                                    onChange={(e) => setVehicleType(e.target.value)}
                                                    placeholder="e.g. Van, Truck"
                                                    className="h-12 rounded-xl bg-background"
                                                />
                                            </div>

                                            {/* Dynamic Fields in Edit Sheet */}
                                            {customFields.length > 0 && (
                                                <div className="space-y-4 pt-2 border-t border-border">
                                                    <h4 className="font-semibold text-sm text-foreground">Additional Details</h4>
                                                    {customFields.map((field) => (
                                                        <div key={field.id} className="space-y-2">
                                                            <label className="text-sm font-semibold text-foreground">{field.field_label}</label>
                                                            {field.field_type === 'select' ? (
                                                                <select
                                                                    value={customValues[field.id] || ''}
                                                                    onChange={(e) => setCustomValues({ ...customValues, [field.id]: e.target.value })}
                                                                    className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                                                                    className="h-12 rounded-xl bg-background"
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
                                        className="w-full h-14 bg-primary hover:bg-primary/90 font-bold text-lg rounded-xl shadow-lg shadow-primary/20 mt-4"
                                    >
                                        <Save size={20} className="mr-2" />
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>

                        {/* Change Password Sheet */}
                        <Sheet open={isPasswordSheetOpen} onOpenChange={setIsPasswordSheetOpen}>
                            <SheetTrigger asChild>
                                <Button className="h-28 flex flex-col items-center justify-center gap-2 bg-card hover:bg-muted text-foreground border border-border shadow-sm rounded-2xl transition-all active:scale-95 group">
                                    <div className="h-10 w-10 bg-amber-500/10 dark:bg-amber-900/20 text-amber-600 dark:text-amber-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Lock size={20} />
                                    </div>
                                    <span className="font-semibold">Security</span>
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="bottom" className="h-[70vh] overflow-y-auto rounded-t-3xl safe-area-pt">
                                <SheetHeader className="mb-6">
                                    <SheetTitle>Change Password</SheetTitle>
                                </SheetHeader>
                                <div className="space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-foreground">New Password</label>
                                        <Input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Enter new password"
                                            minLength={8}
                                            className="h-12 rounded-xl bg-background"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-foreground">Confirm Password</label>
                                        <Input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm new password"
                                            minLength={8}
                                            className="h-12 rounded-xl bg-background"
                                        />
                                    </div>

                                    <Button
                                        onClick={handleChangePassword}
                                        disabled={changingPassword || !newPassword || !confirmPassword}
                                        className="w-full h-14 bg-amber-600 hover:bg-amber-700 font-bold text-lg rounded-xl shadow-lg shadow-amber-500/20 mt-4"
                                    >
                                        <Lock size={20} className="mr-2" />
                                        {changingPassword ? 'Updating...' : 'Change Password'}
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>

                    {/* Logout */}
                    <Button
                        onClick={handleLogout}
                        variant="outline"
                        className="w-full h-14 text-red-600 border border-border bg-card hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 font-bold rounded-xl mt-4"
                    >
                        <LogOut size={20} className="mr-2" />
                        Logout
                    </Button>

                    {/* DANGER ZONE */}
                    <div className="pt-8">
                        <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2 px-1">Danger Zone</p>
                        <Button
                            onClick={async () => {
                                if (confirm("⚠️ WARNING: This will permanently delete your account, drivers, and data. This action cannot be undone.\n\nType 'DELETE' to confirm.")) {
                                    const confirmText = prompt("Type 'DELETE' to confirm account deletion:");
                                    if (confirmText === 'DELETE') {
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
                                    }
                                }
                            }}
                            variant="ghost"
                            className="w-full h-12 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-400 text-sm font-medium rounded-xl border border-dashed border-red-200 dark:border-red-900/50"
                        >
                            Delete My Account
                        </Button>
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
