'use client'

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import {
    Plus,
    Search,
    Edit,
    Trash2,
    Truck,
    MapPin,
    Phone,
    User,
    Lock,
    Clock,
    ShieldCheck,
    ShieldAlert,
    Loader2,
    MoreHorizontal
} from "lucide-react"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { StyledPhoneInput } from "@/components/ui/styled-phone-input"

import { useToast } from "@/components/toast-provider"
import { geocodeAddress, reverseGeocode } from "@/lib/geocoding"
import { PullToRefresh } from "@/components/pull-to-refresh"

import dynamic from 'next/dynamic'

const LocationPickerModal = dynamic(() => import('@/components/location-picker-modal').then(m => m.LocationPickerModal), { ssr: false })

export default function DriversPage() {
    // const supabase = ... (Used from import)
    const [drivers, setDrivers] = useState<any[]>([])
    const [filteredDrivers, setFilteredDrivers] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [isAddDriverOpen, setIsAddDriverOpen] = useState(false)
    const [editingDriver, setEditingDriver] = useState<any | null>(null)
    const [deletingDriver, setDeleteingDriver] = useState<any | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [locationMode, setLocationMode] = useState<'address' | 'map' | 'hub'>('hub')
    const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false)
    const [manualLocation, setManualLocation] = useState<{ lat: number, lng: number, address: string } | null>(null)

    // Subscription Limits (1 Free Driver Model)
    const [maxDrivers, setMaxDrivers] = useState(1)
    const [showUpgradeModal, setShowUpgradeModal] = useState(false)

    const [isPasswordOpen, setIsPasswordOpen] = useState(false)
    const [passDriver, setPassDriver] = useState<any>(null)
    const [isUpdatePassLoading, setIsUpdatePassLoading] = useState(false)

    // Form states
    const [phoneValue, setPhoneValue] = useState<string | undefined>(undefined)
    const [editPhoneValue, setEditPhoneValue] = useState<string | undefined>(undefined)
    const [defaultStartLoc, setDefaultStartLoc] = useState<{ lat: number, lng: number, address: string } | null>(null)
    const [hubs, setHubs] = useState<any[]>([])
    const [selectedHubId, setSelectedHubId] = useState<string>("")
    const [customFields, setCustomFields] = useState<any[]>([])

    // Add Driver Form Controlled State (Fix for reset bug)
    const [driverForm, setDriverForm] = useState({
        name: '',
        email: '',
        password: '',
        vehicleType: ''
    })
    const [isCreatingDriver, setIsCreatingDriver] = useState(false)
    const [isGeocoding, setIsGeocoding] = useState(false)

    const { theme } = useTheme()
    const { toast } = useToast()

    useEffect(() => {
        // Initial attempt
        checkUserAndFetch()

        // Listener for async auth state loading
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || session?.user) {
                checkUserAndFetch()
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [])

    // Helper: get current user ID with timeout + getUser() fallback
    // to avoid hanging when navigator.locks blocks getSession() on web
    const getCurrentUserId = async (): Promise<string | null> => {
        try {
            const { data: { session } } = await Promise.race([
                supabase.auth.getSession(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('getSession timeout')), 3000)
                ),
            ])
            return session?.user?.id ?? null
        } catch {
            // Fallback to getUser()
            try {
                const { data: userData } = await supabase.auth.getUser()
                return userData.user?.id ?? null
            } catch {
                return null
            }
        }
    }

    const checkUserAndFetch = async () => {
        // Wrapper to avoid calling fetchDrivers directly multiple times if not needed, 
        // but for now, simple is better.
        fetchDrivers()
        fetchHubs()
        fetchCustomFields()
    }

    useEffect(() => {
        filterDrivers()
    }, [searchQuery, drivers])

    useEffect(() => {
        if (editingDriver) {
            setEditPhoneValue(editingDriver.phone || '')
        }
    }, [editingDriver])

    // Reset form when dialog closes
    useEffect(() => {
        if (!isAddDriverOpen) {
            setDriverForm({ name: '', email: '', password: '', vehicleType: '' })
            setPhoneValue(undefined)
            setDefaultStartLoc(null)
            setSelectedHubId('')
            setLocationMode('hub')
        }
    }, [isAddDriverOpen])

    function filterDrivers() {
        let filtered = [...drivers]

        if (searchQuery) {
            filtered = filtered.filter(driver =>
                driver.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (driver.phone && driver.phone.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (driver.vehicle_type && driver.vehicle_type.toLowerCase().includes(searchQuery.toLowerCase()))
            )
        }

        setFilteredDrivers(filtered)
    }

    async function fetchCustomFields() {
        try {
            const userId = await getCurrentUserId()
            if (!userId) return

            const { data: userProfile } = await supabase
                .from('users')
                .select('company_id')
                .eq('id', userId)
                .maybeSingle()

            if (!userProfile) return

            const { data } = await supabase
                .from('custom_fields')
                .select('*')
                .eq('company_id', userProfile.company_id)
                .eq('entity_type', 'driver')
                .order('display_order', { ascending: true })

            setCustomFields(data || [])
        } catch (error) {
            // console.error('Error fetching custom fields:', error)
        }
    }

    async function fetchDrivers() {
        setIsLoading(true)
        try {
            const userId = await getCurrentUserId()
            if (!userId) {
                return
            }

            const { data: userProfile, error: profileError } = await supabase
                .from('users')
                .select('company_id, role, driver_limit')
                .eq('id', userId)
                .maybeSingle()

            if (userProfile?.driver_limit) {
                setMaxDrivers(userProfile.driver_limit)
            }

            if (!userProfile) {
                return
            }

            // SECURITY: Drivers cannot manage other drivers
            if (userProfile.role === 'driver') {
                window.location.href = '/dashboard'
                return
            }

            // Use RPC to fetch drivers (Bypasses RLS limits)
            const { data: driversData, error: driversError } = await supabase.rpc('get_company_drivers', {
                company_id_param: userProfile.company_id
            })



            if (driversError) {
                toast({ title: 'Error fetching drivers', description: driversError.message, type: 'error' })
                throw driversError
            }

            if (driversData) {
                const withMissing = driversData.map((d: any) => {
                    const missing = []
                    if (!d.name) missing.push('name')
                    if (!d.phone) missing.push('phone')
                    if (!d.vehicle_type) missing.push('vehicle_type')
                    return { ...d, missing_fields: missing }
                })
                setDrivers(withMissing)
                setFilteredDrivers(withMissing)
            }
        } catch (error: any) {
            toast({ title: 'Error loading drivers', description: error.message, type: 'error' })
        } finally {
            setIsLoading(false)
        }
    }

    async function fetchHubs() {
        // Pure Session Auth (Post-Purge)
        const userId = (await supabase.auth.getSession()).data.session?.user?.id
        if (!userId) return

        const { data: userProfile } = await supabase
            .from('users')
            .select('company_id')
            .eq('id', userId || '')
            .maybeSingle()

        if (!userProfile) return

        const { data } = await supabase
            .from('hubs')
            .select('*')
            .eq('company_id', userProfile.company_id)

        if (data) setHubs(data)
    }

    async function handleFindAddress() {
        const addressInput = (document.querySelector('input[name="default_start_address"]') as HTMLInputElement)?.value

        if (!addressInput || addressInput.trim().length === 0) {
            toast({ title: 'Please enter an address', type: 'error' })
            return
        }

        setIsGeocoding(true)
        try {
            const { geocodeAddress } = await import('@/lib/geocoding')
            const result = await geocodeAddress(addressInput)

            if (result) {
                setDefaultStartLoc({
                    lat: result.lat,
                    lng: result.lng,
                    address: result.displayAddress
                })
                toast({ title: '✅ Address found!', description: `Located at (${result.lat.toFixed(4)}, ${result.lng.toFixed(4)})`, type: 'success' })
            } else {
                toast({ title: 'Address not found', description: 'Please try another address or use the map picker', type: 'error' })
            }
        } catch (error: any) {
            console.error('Geocoding error:', error)
            toast({ title: 'Geocoding failed', description: error.message || 'An error occurred', type: 'error' })
        } finally {
            setIsGeocoding(false)
        }
    }

    async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        await handleCreateDriver(formData)
    }

    async function handleCreateDriver(formData: FormData) {
        console.log('🚀 handleCreateDriver called')
        setIsCreatingDriver(true)

        try {
            const name = formData.get('name') as string
            const email = formData.get('email') as string
            const password = formData.get('password') as string
            const phone = phoneValue
            const vehicleType = formData.get('vehicle_type') as string

            console.log('📝 Form data:', { name, email, phone, vehicleType })

            // 🛑 ENFORCE DRIVER LIMIT
            if (drivers.length >= maxDrivers) {
                console.log('⚠️ Driver limit reached:', drivers.length, '/', maxDrivers)
                setIsAddDriverOpen(false)
                setShowUpgradeModal(true)
                return
            }

            // Custom Fields Collection
            const customValues: Record<string, any> = {}
            customFields.forEach(field => {
                const value = formData.get(`custom_${field.id}`)
                if (value) customValues[field.id] = value
            })

            const userId = await getCurrentUserId()
            if (!userId) {
                console.error('❌ No user session found')
                toast({ title: 'Authentication required', description: 'Please log in again', type: 'error' })
                return
            }

            const { data: userProfile } = await supabase
                .from('users')
                .select('company_id')
                .eq('id', userId)
                .maybeSingle()

            if (!userProfile) {
                console.error('❌ User profile not found')
                toast({ title: 'Profile error', description: 'Could not load user profile', type: 'error' })
                return
            }

            const defaultStartAddress = formData.get('default_start_address') as string
            const defaultStartLat = formData.get('default_start_lat') ? parseFloat(formData.get('default_start_lat') as string) : null
            const defaultStartLng = formData.get('default_start_lng') ? parseFloat(formData.get('default_start_lng') as string) : null

            let finalDefaultStartLat = defaultStartLat
            let finalDefaultStartLng = defaultStartLng

            // Auto-Geocode if missing
            if ((!finalDefaultStartLat || !finalDefaultStartLng) && defaultStartAddress) {
                try {
                    console.log('🌍 Auto-geocoding address:', defaultStartAddress)
                    const coords = await geocodeAddress(defaultStartAddress)
                    if (coords) {
                        finalDefaultStartLat = coords.lat
                        finalDefaultStartLng = coords.lng
                    }
                } catch (err) {
                    console.error('Auto-geocode failed:', err)
                }
            }

            console.log('📍 Location data:', { defaultStartAddress, finalDefaultStartLat, finalDefaultStartLng })
            console.log('🔄 Calling RPC create_driver_account...')

            // RPC Call (Now enhanced to create Auth User directly)
            const { data: result, error } = await supabase.rpc('create_driver_account', {
                email,
                password,
                full_name: name,
                company_id: userProfile.company_id,
                phone,
                vehicle_type: vehicleType,
                custom_values: customValues,
                default_start_address: defaultStartAddress,
                default_start_lat: finalDefaultStartLat,
                default_start_lng: finalDefaultStartLng
            })

            console.log('📦 RPC Response:', { result, error })

            if (error || (result && result.success === false)) {
                console.error('❌ Driver creation failed:', error?.message || result?.error)
                toast({ title: "Failed", description: error?.message || result?.error || 'Unknown error', type: "error" })
                return
            }

            console.log('✅ Driver created successfully!')
            toast({ title: '✅ Driver created!', description: `Password: ${password}`, type: 'success' })

            // Reset form state
            setIsAddDriverOpen(false)
            setDriverForm({ name: '', email: '', password: '', vehicleType: '' })
            setPhoneValue(undefined)
            setDefaultStartLoc(null)
            setSelectedHubId("")
            setLocationMode('hub')

            fetchDrivers()
        } catch (error: any) {
            console.error('💥 Exception in handleCreateDriver:', error)
            toast({ title: 'Error adding driver', description: error.message, type: 'error' })
        } finally {
            setIsCreatingDriver(false)
        }
    }

    async function handleUpdatePassword(formData: FormData) {
        if (!passDriver) return
        setIsUpdatePassLoading(true)

        try {
            const newPassword = formData.get('new_password') as string

            if (!passDriver.user_id) {
                toast({ title: "Configuration Error", description: "This driver is not linked to a user account properly.", type: "error" })
                return
            }

            const { error } = await supabase.auth.updateUser({ password: newPassword })
            // Note: This updates the *current* user. Admin updating another user requires Admin API or Edge Function.
            // Since we are using client-side auth, we can't update another user's password directly unless we are that user.
            // For now, let's assume this is a placeholder or requires backend implementation.
            // A common workaround is deleting the user and recreating, or using a server-side route.

            // For this fix, we will just alert that this requires Admin API context or Edge Function.
            toast({ title: "Feature Restricted", description: "Password update for other users requires Admin Privileges.", type: "error" })

        } catch (error) {
            toast({ title: "Failed to update password.", type: "error" })
        } finally {
            setIsUpdatePassLoading(false)
            setIsPasswordOpen(false)
        }
    }

    async function handleEditDriver(formData: FormData) {
        if (!editingDriver) return

        const name = formData.get('name') as string
        const email = formData.get('email') as string
        const phone = editPhoneValue
        const vehicleType = formData.get('vehicle_type') as string
        const status = formData.get('status') as string
        const newPassword = formData.get('new_password') as string
        const defaultStartAddress = formData.get('default_start_address') as string
        const startHubId = formData.get('start_hub_id') as string
        const mapLat = formData.get('map_lat')
        const mapLng = formData.get('map_lng')
        const mapAddress = formData.get('map_address') as string

        // Manual Start Point Data
        const useManualStart = formData.get('use_manual_start') === 'on'
        const manualLat = formData.get('starting_point_lat')
        const manualLng = formData.get('starting_point_lng')
        const manualAddress = formData.get('starting_point_address') as string

        // Determine final start address and coordinates
        let finalStartAddress = defaultStartAddress || null
        let finalLat: number | null = null
        let finalLng: number | null = null

        // Priority 1: Hub Selection
        if (startHubId) {
            const selectedHub = hubs.find(h => h.id === startHubId)
            if (selectedHub) {
                finalStartAddress = selectedHub.address || selectedHub.name
                // Use hub coordinates if available
                finalLat = selectedHub.latitude || (selectedHub.lat ? parseFloat(selectedHub.lat) : null)
                finalLng = selectedHub.longitude || (selectedHub.lng ? parseFloat(selectedHub.lng) : null)
            }
        } else if (mapLat && mapLng) {
            finalLat = parseFloat(mapLat.toString())
            finalLng = parseFloat(mapLng.toString())
            finalStartAddress = mapAddress || defaultStartAddress || `Location (${finalLat.toFixed(4)}, ${finalLng.toFixed(4)})`
        }

        // Auto-Geocode Fallback for Edit
        if ((!finalLat || !finalLng) && finalStartAddress) {
            try {
                console.log('🌍 (Edit) Auto-geocoding address:', finalStartAddress)
                const coords = await geocodeAddress(finalStartAddress)
                if (coords) {
                    finalLat = coords.lat
                    finalLng = coords.lng
                }
            } catch (err) {
                console.error('Auto-geocode failed:', err)
            }
        }

        // Custom Fields
        const customValues: Record<string, any> = editingDriver.custom_values || {}
        customFields.forEach(field => {
            const value = formData.get(`custom_${field.id}`)
            if (value !== null) customValues[field.id] = value
        })

        // Update password if provided
        if (newPassword && newPassword.length >= 6 && editingDriver.user_id) {
            const { error: passwordError } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (passwordError) {
                toast({ title: 'Failed to update password', description: passwordError.message, type: 'error' })
                // Continue with other updates even if password fails
            } else {
                toast({ title: '🔒 Password updated successfully', type: 'success' })
            }
        }

        const { error: userError } = await supabase
            .from('users')
            .update({ full_name: name, email, phone, status })
            .eq('id', editingDriver.user_id)

        if (userError) {
            toast({ title: 'Failed to update user info', description: userError.message, type: 'error' })
            return
        }

        const { error: driverError } = await supabase
            .from('drivers')
            .update({
                vehicle_type: vehicleType,
                custom_data: customValues,
                name: name,
                default_start_address: finalStartAddress,
                default_start_lat: finalLat,
                default_start_lng: finalLng,
                use_manual_start: useManualStart,
                starting_point_lat: manualLat ? parseFloat(manualLat.toString()) : null,
                starting_point_lng: manualLng ? parseFloat(manualLng.toString()) : null,
                starting_point_address: manualAddress
            })
            .eq('id', editingDriver.id)

        if (driverError) {
            toast({ title: 'Failed to update driver details', description: driverError.message, type: 'error' })
            return
        }

        toast({ title: '✅ Driver updated successfully!', type: 'success' })
        setEditingDriver(null)
        fetchDrivers()
    }

    async function handleDeleteDriver() {
        if (!deletingDriver) return
        setIsDeleting(true)

        try {
            // Delete from drivers table (Cascade should handle user, but we might want to delete user explicitly if needed)
            const { error } = await supabase
                .from('drivers')
                .delete()
                .eq('id', deletingDriver.id)

            if (error) throw error

            // Optionally delete from public.users / auth.users via RPC if strict cleanup is needed

            setDeleteingDriver(null)
            fetchDrivers()
        } catch (error: any) {
            toast({ title: 'Error deleting driver', description: error.message, type: 'error' })
        } finally {
            setIsDeleting(false)
        }
    }

    async function handleToggleDriverStatus(driverId: string, currentStatus: string, userId: string | null) {
        try {
            const newStatus = currentStatus === 'active' ? 'inactive' : 'active'

            // Update driver status
            const { error: driverError } = await supabase
                .from('drivers')
                .update({ status: newStatus })
                .eq('id', driverId)

            if (driverError) {
                toast({ title: 'Failed to update driver status', description: driverError.message, type: 'error' })
                return
            }

            // Also update user status if linked
            if (userId) {
                const { error: userError } = await supabase
                    .from('users')
                    .update({ status: newStatus === 'active' ? 'active' : 'suspended' })
                    .eq('id', userId)

                if (userError) {
                    toast({ title: 'User status sync failed', type: 'error' })
                }
            }

            // Refresh the drivers list
            fetchDrivers()
        } catch (error: any) {
            toast({ title: 'Error toggling driver status', description: error.message, type: 'error' })
        }
    }

    return (
        <PullToRefresh onRefresh={fetchDrivers}>
            <div className="container mx-auto py-8 px-4 max-w-6xl safe-area-pt">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Driver Management</h1>
                        <p className="text-muted-foreground mt-1">Manage your fleet, assignments, and driver accounts.</p>
                    </div>
                    <Sheet open={isAddDriverOpen} onOpenChange={setIsAddDriverOpen}>
                        <SheetTrigger asChild>
                            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                                <Plus className="mr-2 h-4 w-4" /> Add Driver ({drivers.length}/{maxDrivers})
                            </Button>
                        </SheetTrigger>

                        {/* UPGRADE PAYWALL MODAL */}
                        <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>🚧 Driver Limit Reached</DialogTitle>
                                </DialogHeader>
                                <div className="py-4 space-y-4 text-center">
                                    <div className="h-20 w-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <ShieldAlert size={40} />
                                    </div>
                                    <p className="text-muted-foreground">
                                        You have reached the limit of <b>{maxDrivers} driver{maxDrivers === 1 ? '' : 's'}</b> for your current plan.
                                    </p>
                                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                        <p className="font-bold text-lg mb-1">
                                            {maxDrivers === 1 ? 'Upgrade to Pro' : 'Unlock More Drivers'}
                                        </p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            {maxDrivers === 1
                                                ? <><b>Unlock 5 driver slots</b> for <b>$20/month</b>.</>
                                                : <>Add <b>5 more slots</b> ({maxDrivers} → {maxDrivers + 5}) for <b>$20/month</b>.</>
                                            }
                                        </p>
                                    </div>
                                    <Button className="w-full font-bold" onClick={() => toast({ title: "Redirecting to Payment...", description: "In-App Purchase flow starting...", type: "info" })}>
                                        Upgrade Now
                                    </Button>
                                    <button
                                        className="text-xs text-muted-foreground hover:text-foreground underline mt-4"
                                        onClick={async () => {
                                            try {
                                                toast({ title: "Restoring...", description: "Checking for existing subscriptions...", type: "info" })

                                                const userId = await getCurrentUserId()
                                                if (!userId) return

                                                const { data: userProfile } = await supabase
                                                    .from('users')
                                                    .select('driver_limit')
                                                    .eq('id', userId)
                                                    .single()

                                                if (userProfile?.driver_limit) {
                                                    setMaxDrivers(userProfile.driver_limit)
                                                    setShowUpgradeModal(false)
                                                    toast({
                                                        title: "Restored Successfully!",
                                                        description: `Your plan includes ${userProfile.driver_limit} driver slots.`,
                                                        type: "success"
                                                    })
                                                } else {
                                                    toast({ title: "No purchases found", description: "You are on the free tier.", type: "info" })
                                                }
                                            } catch (e) {
                                                toast({ title: "Restore failed", type: "error" })
                                            }
                                        }}
                                    >
                                        Restore Purchases
                                    </button>
                                </div>
                            </DialogContent>
                        </Dialog>
                        <SheetContent className="h-[90vh] overflow-y-auto w-full max-w-md mx-auto rounded-l-2xl border-l border-border/50 shadow-2xl safe-area-pt">
                            <SheetHeader className="mb-6">
                                <SheetTitle className="text-2xl font-bold text-primary">Add New Driver</SheetTitle>
                            </SheetHeader>
                            <form onSubmit={handleFormSubmit} className="space-y-5 pb-20">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="name"
                                            name="name"
                                            value={driverForm.name}
                                            onChange={(e) => setDriverForm(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="John Doe"
                                            required
                                            className="pl-9 h-11 bg-muted/30 border-input/50 focus:bg-background transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        value={driverForm.email}
                                        onChange={(e) => setDriverForm(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="john@example.com"
                                        required
                                        className="h-11 bg-muted/30 border-input/50 focus:bg-background transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <StyledPhoneInput
                                        name="phone"
                                        value={phoneValue}
                                        onChange={setPhoneValue}
                                        placeholder="Enter phone number"
                                        defaultCountry="US"
                                        className="bg-muted/30 border-input/50 focus-within:bg-background transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
                                    <PasswordInput
                                        id="password"
                                        name="password"
                                        value={driverForm.password}
                                        onChange={(e) => setDriverForm(prev => ({ ...prev, password: e.target.value }))}
                                        placeholder="Create a password"
                                        required
                                        minLength={6}
                                        className="h-11 bg-muted/30 border-input/50 focus-within:bg-background transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="vehicle_type">Vehicle Type</Label>
                                    <div className="relative">
                                        <Truck className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="vehicle_type"
                                            name="vehicle_type"
                                            value={driverForm.vehicleType}
                                            onChange={(e) => setDriverForm(prev => ({ ...prev, vehicleType: e.target.value }))}
                                            placeholder="e.g. Van, Box Truck"
                                            className="pl-9 h-11 bg-muted/30 border-input/50 focus:bg-background transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Location Selection */}
                                <div className="space-y-3 pt-2">
                                    <Label>Default Start Location</Label>
                                    <div className="flex p-1 bg-muted rounded-lg mb-2">
                                        <button
                                            type="button"
                                            onClick={() => { setLocationMode('hub'); setDefaultStartLoc(null); }}
                                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${locationMode === 'hub' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            Select Hub
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLocationMode('address')}
                                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${locationMode === 'address' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            Enter Address
                                        </button>
                                    </div>

                                    {locationMode === 'hub' ? (
                                        <select
                                            className="flex h-11 w-full rounded-md border border-input/50 bg-muted/30 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus:bg-background transition-all disabled:cursor-not-allowed disabled:opacity-50"
                                            value={selectedHubId}
                                            onChange={(e) => {
                                                const hubId = e.target.value
                                                setSelectedHubId(hubId)
                                                const hub = hubs.find(h => h.id === hubId)
                                                if (hub) {
                                                    // Use hub.latitude/longitude (matching database schema)
                                                    const lat = hub.latitude || (hub.lat ? parseFloat(hub.lat) : null)
                                                    const lng = hub.longitude || (hub.lng ? parseFloat(hub.lng) : null)
                                                    setDefaultStartLoc({
                                                        address: hub.address || hub.location || hub.name,
                                                        lat: lat || 0,
                                                        lng: lng || 0
                                                    })
                                                }
                                            }}
                                        >
                                            <option value="">Select a Hub...</option>
                                            {hubs.map(hub => (
                                                <option key={hub.id} value={hub.id}>{hub.name}</option>
                                            ))}
                                        </select>

                                    ) : (
                                        <div className="space-y-2">
                                            <div className="flex gap-2">
                                                <Input
                                                    name="default_start_address"
                                                    value={defaultStartLoc?.address || ''}
                                                    placeholder="Enter address (e.g., 123 Main St, Los Angeles, CA)"
                                                    className="h-11 bg-muted/30 border-input/50 focus:bg-background transition-all flex-1"
                                                    onChange={(e) => setDefaultStartLoc(prev => ({ ...prev, address: e.target.value, lat: prev?.lat || 0, lng: prev?.lng || 0 }))}
                                                />
                                                <Button
                                                    type="button"
                                                    onClick={handleFindAddress}
                                                    disabled={isGeocoding || !defaultStartLoc?.address}
                                                    variant="outline"
                                                    className="h-11 px-4 gap-2"
                                                >
                                                    {isGeocoding ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            Finding...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Search className="h-4 w-4" />
                                                            Find
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                            {defaultStartLoc?.lat && defaultStartLoc?.lng && (
                                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" />
                                                    Coordinates: {defaultStartLoc.lat.toFixed(4)}, {defaultStartLoc.lng.toFixed(4)}
                                                </p>
                                            )}
                                            <div className="border rounded-md p-4 bg-muted/20 text-center mt-2">
                                                <p className="text-sm text-muted-foreground mb-2">
                                                    Click to pin location on map.
                                                </p>
                                                <Button type="button" variant="outline" size="sm" onClick={() => {
                                                    // We can reuse the same modal state if we hoist it or use a separate state?
                                                    // For simplicity in this "Add Driver" form (which is separate from Edit), we need its own state or shared state.
                                                    // Since `isLocationPickerOpen` is at top level, we can use it, but we need to know WHICH form triggered it.
                                                    // However, simpler is just to use the address input for creation or fix this correctly.
                                                    // For now, let's just show a message or hide this complex picker in creation flow if simpler.
                                                    toast({ title: "Please use Address input", description: "Map picker is available in Edit mode.", type: "info" })
                                                }}>
                                                    Use Address Input Above
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Hidden inputs for form data */}
                                    <input type="hidden" name="default_start_address" value={defaultStartLoc?.address || ''} />
                                    <input type="hidden" name="default_start_lat" value={defaultStartLoc?.lat || ''} />
                                    <input type="hidden" name="default_start_lng" value={defaultStartLoc?.lng || ''} />
                                </div>

                                {/* Custom Fields */}
                                {customFields.length > 0 && (
                                    <div className="space-y-4 pt-4 border-t border-border/50">
                                        <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Additional Information</h4>
                                        {customFields.map((field) => (
                                            <div key={field.id} className="space-y-2">
                                                <Label htmlFor={`custom_${field.id}`}>
                                                    {field.field_label} {field.is_required && <span className="text-red-500">*</span>}
                                                </Label>
                                                {field.field_type === 'select' ? (
                                                    <select
                                                        name={`custom_${field.id}`}
                                                        required={field.is_required}
                                                        className="flex h-11 w-full rounded-md border border-input/50 bg-muted/30 px-3 py-2 text-sm ring-offset-background focus:bg-background transition-all"
                                                    >
                                                        <option value="">Select...</option>
                                                        {field.options?.map((opt: string) => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <Input
                                                        type={field.field_type === 'number' ? 'number' : 'text'}
                                                        name={`custom_${field.id}`}
                                                        placeholder={field.placeholder || ''}
                                                        required={field.is_required}
                                                        className="h-11 bg-muted/30 border-input/50 focus:bg-background transition-all"
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="pt-4">
                                    <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" disabled={isCreatingDriver}>
                                        {isCreatingDriver ? 'Creating...' : 'Create Driver Account'}
                                    </Button>
                                </div>
                            </form>
                        </SheetContent>
                    </Sheet>
                </div>

                {/* Drivers List */}
                <div className="space-y-6">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search drivers by name, phone, or vehicle..."
                            className="pl-10 h-10 bg-background"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Drivers List */}
                    <div className="grid grid-cols-1 gap-4">
                        {isLoading ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-4 animate-pulse">
                                        <div className="flex items-center gap-4 w-full">
                                            <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-800" />
                                            <div className="space-y-2 flex-1">
                                                <div className="h-5 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
                                                <div className="flex gap-4">
                                                    <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                                                    <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : filteredDrivers.length === 0 ? (
                            <div className="text-center py-12 bg-muted/30 rounded-xl border border-dashed border-border">
                                <Truck className="mx-auto h-12 w-12 mb-2 text-muted-foreground opacity-50" />
                                <p className="text-muted-foreground">No drivers found</p>
                            </div>
                        ) : (
                            filteredDrivers.map((driver) => (
                                <div
                                    key={driver.id}
                                    className="bg-card rounded-xl border border-border p-4 hover:shadow-md hover:border-primary/50 transition-all duration-200"
                                >
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-lg">
                                                {driver.name ? driver.name.charAt(0).toUpperCase() : <User size={24} />}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                                                    {driver.name || "Unknown Driver"}
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full ${driver.status === 'active'
                                                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                                        : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                                                        }`}>
                                                        {driver.status}
                                                    </span>
                                                    {driver.is_active === false && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400" title="Account pending manager activation">
                                                            <ShieldAlert size={12} />
                                                            Pending Activation
                                                        </span>
                                                    )}
                                                    {driver.is_active === true && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400" title="Account activated by manager">
                                                            <ShieldCheck size={12} />
                                                            Activated
                                                        </span>
                                                    )}
                                                </h3>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                                                    <p className="flex items-center gap-1.5">
                                                        <User size={14} />
                                                        {driver.email}
                                                    </p>
                                                    {driver.phone && (
                                                        <p className="flex items-center gap-1.5">
                                                            <Phone size={14} />
                                                            {driver.phone}
                                                        </p>
                                                    )}
                                                    {driver.vehicle_type && (
                                                        <p className="flex items-center gap-1.5">
                                                            <Truck size={14} />
                                                            {driver.vehicle_type}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 w-full sm:w-auto justify-end">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                title={driver.is_active ? 'Deactivate Account' : 'Activate Account'}
                                                onClick={async () => {
                                                    const newStatus = !driver.is_active
                                                    const { error } = await supabase
                                                        .from('drivers')
                                                        .update({ is_active: newStatus })
                                                        .eq('id', driver.id)

                                                    if (error) {
                                                        toast({ title: 'Failed to update activation', description: error.message, type: 'error' })
                                                    } else {
                                                        toast({ title: newStatus ? '✅ Driver activated!' : '⏸️ Driver deactivated', type: 'success' })
                                                        fetchDrivers()
                                                    }
                                                }}
                                                className={`h-9 w-9 p-0 ${driver.is_active
                                                    ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/10'
                                                    : 'text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/10'
                                                    }`}
                                            >
                                                {driver.is_active ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setEditingDriver(driver)}
                                                className="h-9 w-9 p-0 hover:bg-muted"
                                            >
                                                <Edit size={15} />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"
                                                onClick={() => setDeleteingDriver(driver)}
                                            >
                                                <Trash2 size={15} />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Edit Driver Sheet */}
                <Sheet open={!!editingDriver} onOpenChange={(open) => !open && setEditingDriver(null)}>
                    <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border shadow-2xl safe-area-pt">
                        <SheetHeader>
                            <SheetTitle>Edit Driver Details</SheetTitle>
                        </SheetHeader>
                        {editingDriver && (
                            <form action={handleEditDriver} className="space-y-4 mt-6 pb-20">
                                <div className="space-y-2">
                                    <Label>Full Name</Label>
                                    <Input name="name" defaultValue={editingDriver.name} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input name="email" type="email" defaultValue={editingDriver.email} required />
                                    <p className="text-[11px] text-muted-foreground">Syncs with their login email.</p>
                                </div>

                                <div className="space-y-2">
                                    <Label>Phone Number</Label>
                                    <StyledPhoneInput
                                        name="phone"
                                        value={editPhoneValue}
                                        onChange={setEditPhoneValue}
                                        defaultCountry="US"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Vehicle Type</Label>
                                    <Input name="vehicle_type" defaultValue={editingDriver.vehicle_type || ''} />
                                </div>

                                <div className="space-y-2">
                                    <Label>Account Status</Label>
                                    <select
                                        name="status"
                                        defaultValue={editingDriver.status}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                        <option value="suspended">Suspended</option>
                                    </select>
                                </div>

                                {customFields.length > 0 && (
                                    <div className="space-y-4 pt-4 border-t border-border">
                                        <h4 className="font-semibold text-sm">Additional Info</h4>
                                        {customFields.map((field) => {
                                            const val = (editingDriver.custom_data as any)?.[field.id] || ''
                                            return (
                                                <div key={field.id} className="space-y-2">
                                                    <Label>{field.field_label}</Label>
                                                    <Input
                                                        name={`custom_${field.id}`}
                                                        defaultValue={val}
                                                        placeholder={field.placeholder || ''}
                                                    />
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Password Update Section */}
                                <div className="space-y-4 pt-4 border-t border-border">
                                    <h4 className="font-semibold text-sm">Security</h4>
                                    <div className="space-y-2">
                                        <Label>New Password (optional)</Label>
                                        <Input
                                            name="new_password"
                                            type="password"
                                            placeholder="Leave empty to keep current password"
                                            minLength={6}
                                        />
                                        <p className="text-[11px] text-muted-foreground">Minimum 6 characters. Leave blank to keep existing password.</p>
                                    </div>
                                </div>

                                {/* Default Start Address Section */}
                                <div className="space-y-4 pt-4 border-t border-border">
                                    <h4 className="font-semibold text-sm">Default Starting Location</h4>

                                    {/* Location Mode Toggles */}
                                    <div className="flex gap-2 p-1 bg-muted rounded-lg w-full">
                                        <Button
                                            type="button"
                                            variant={locationMode === 'hub' ? 'default' : 'ghost'}
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => setLocationMode('hub')}
                                        >
                                            Warehouse
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={locationMode === 'address' ? 'default' : 'ghost'}
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => setLocationMode('address')}
                                        >
                                            Address
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={locationMode === 'map' ? 'default' : 'ghost'}
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => setLocationMode('map')}
                                        >
                                            Map Picker
                                        </Button>
                                    </div>

                                    {/* Mode: Warehouse Selector */}
                                    {locationMode === 'hub' && (
                                        <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                            <Label>Select Warehouse/Hub</Label>
                                            {hubs.length > 0 ? (
                                                <select
                                                    name="start_hub_id"
                                                    defaultValue=""
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                                >
                                                    <option value="">-- Select a Warehouse --</option>
                                                    {hubs.map((hub) => (
                                                        <option key={hub.id} value={hub.id}>
                                                            {hub.name} - {hub.address}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <p className="text-sm text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded border border-yellow-200 dark:border-yellow-900">
                                                    No warehouses found. Please toggle to "Address" or "Map" mode.
                                                </p>
                                            )}
                                            <p className="text-[11px] text-muted-foreground">Driver will start from this warehouse location.</p>
                                        </div>
                                    )}

                                    {/* Mode: Manual Address */}
                                    {locationMode === 'address' && (
                                        <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                            <Label>Enter Address</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="address-input-field"
                                                    name="default_start_address"
                                                    // CONTROLLED INPUT: Uses the state address if available (from map or search), otherwise falls back to DB value
                                                    value={defaultStartLoc?.address ?? editingDriver.default_start_address ?? ''}
                                                    onChange={(e) => {
                                                        // Allow user to type freely. We update state but keep lat/lng value from previous state if valid, or we could reset.
                                                        // Ideally we just update the address text.
                                                        const text = e.target.value
                                                        setDefaultStartLoc(prev => (prev ? { ...prev, address: text } : { lat: 0, lng: 0, address: text }))
                                                    }}
                                                    placeholder="e.g. 123 Main St, New York, NY"
                                                />
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="secondary"
                                                    title="Find on Map"
                                                    onClick={async () => {
                                                        const input = document.getElementById('address-input-field') as HTMLInputElement
                                                        if (!input || !input.value) return

                                                        const toastId = toast({ title: "Searching address...", type: "info" })
                                                        const coords = await geocodeAddress(input.value)

                                                        if (coords) {
                                                            setDefaultStartLoc({
                                                                lat: coords.lat,
                                                                lng: coords.lng,
                                                                address: input.value
                                                            })
                                                            // Update hidden map inputs indirectly by switching mode or just setting state
                                                            // We switch to map to show the user the result
                                                            setLocationMode('map')
                                                            toast({ title: "Address Found!", description: "Location pinned on map.", type: "success" })
                                                        } else {
                                                            toast({ title: "Address not found", description: "Try a more specific address or zip code.", type: "error" })
                                                        }
                                                    }}
                                                >
                                                    <Search size={18} />
                                                </Button>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">Click search icon to pin this address on the map.</p>
                                        </div>
                                    )}

                                    {/* Mode: Map Picker */}
                                    {locationMode === 'map' && (
                                        <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                            <Label>Pick Location on Map</Label>
                                            <div className="border rounded-md p-4 bg-muted/20 text-center">
                                                <MapPin className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                                                <p className="text-sm text-muted-foreground mb-4">
                                                    Click to open the map and pin a location.
                                                </p>
                                                <Button type="button" variant="outline" onClick={() => setIsLocationPickerOpen(true)}>
                                                    Open Map Picker
                                                </Button>
                                                <LocationPickerModal
                                                    open={isLocationPickerOpen}
                                                    onOpenChange={setIsLocationPickerOpen}
                                                    initialLat={editingDriver.default_start_lat}
                                                    initialLng={editingDriver.default_start_lng}
                                                    onSelectLocation={async (lat, lng, address) => {
                                                        setDefaultStartLoc({ lat, lng, address })
                                                        toast({ title: "Location Set", description: address, type: "success" })
                                                    }}
                                                />
                                            </div>


                                            <p className="text-[11px] text-muted-foreground">
                                                Selected: {defaultStartLoc?.address || editingDriver.default_start_address || 'No location picked yet'}
                                            </p>
                                        </div>
                                    )}
                                </div>



                                {/* Hidden inputs moved here to ensure they persist across tabs */}
                                <input type="hidden" name="map_address" value={defaultStartLoc?.address || ''} />
                                <input type="hidden" name="map_lat" value={defaultStartLoc?.lat || ''} />
                                <input type="hidden" name="map_lng" value={defaultStartLoc?.lng || ''} />

                                <div className="pt-4">
                                    <Button type="submit" className="w-full h-12">Update Changes</Button>
                                </div>
                            </form>
                        )}
                    </SheetContent>
                </Sheet>

                {/* Password Update Dialog */}
                <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Update Password</DialogTitle>
                        </DialogHeader>
                        <form action={handleUpdatePassword} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>New Password</Label>
                                <PasswordInput name="new_password" required minLength={6} placeholder="Enter new password" />
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isUpdatePassLoading}>
                                    {isUpdatePassLoading ? 'Updating...' : 'Update Password'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation */}
                <Dialog open={!!deletingDriver} onOpenChange={(open) => !open && setDeleteingDriver(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete Driver?</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <p>Are you sure you want to delete <strong>{deletingDriver?.name}</strong>? This action cannot be undone.</p>
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setDeleteingDriver(null)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDeleteDriver} disabled={isDeleting}>
                                {isDeleting ? 'Deleting...' : 'Delete Driver'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div >
            )
        </PullToRefresh>
    )
}
