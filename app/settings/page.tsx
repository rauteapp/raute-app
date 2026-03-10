"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet"
import { Plus, MapPin, Building2, Trash2, ArrowLeft, Save, Search, Settings2, Weight, MapPinned, Mail } from "lucide-react"
import LocationPicker from "@/components/location-picker"
import { useToast } from "@/components/toast-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { PullToRefresh } from "@/components/pull-to-refresh"
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
    const [hubs, setHubs] = useState<Hub[]>([])
    const [loading, setLoading] = useState(true)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [companyId, setCompanyId] = useState<string | null>(null)
    const [featureSettings, setFeatureSettings] = useState(DEFAULT_SETTINGS)
    const [savingFeatures, setSavingFeatures] = useState(false)

    // Form State
    const [newHubName, setNewHubName] = useState("")
    const [newHubAddress, setNewHubAddress] = useState("")
    const [newHubLoc, setNewHubLoc] = useState<{ lat: number, lng: number } | null>(null)

    useEffect(() => {
        fetchHubs()
    }, [])

    async function fetchHubs() {
        try {
            setLoading(true)

            // Auth with Fallback
            let userId: string | undefined
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                userId = user.id
            }

            if (!userId) {
                router.push("/login")
                return
            }

            const { data: userProfile } = await supabase
                .from('users')
                .select('company_id, role')
                .eq('id', userId)
                .single()

            if (userProfile?.role === 'driver') {
                router.push("/dashboard")
                return
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
            fetchHubs()
        } catch (error) {
            toast({ title: "Failed to add warehouse", type: "error" })
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteHub(id: string) {
        if (!confirm("Delete this warehouse?")) return
        try {
            const { error } = await supabase.from('hubs').delete().eq('id', id)
            if (error) throw error
            setHubs(prev => prev.filter(h => h.id !== id))
            toast({ title: "Warehouse deleted", type: "success" })
        } catch (error) {
            toast({ title: "Failed to delete", type: "error" }) // Fixed toast type to "error"
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

    if (loading) {
        return (
            <div className="p-4 space-y-4 max-w-3xl mx-auto">
                <Skeleton className="h-10 w-48 mb-6" />
                <div className="grid gap-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
                </div>
            </div>
        )
    }

    return (
        <PullToRefresh onRefresh={fetchHubs}>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-slate-50 to-slate-100 dark:from-blue-950/20 dark:via-slate-950 dark:to-slate-900">
                <header
                    className="sticky top-0 z-20 px-5 pb-5 flex items-center justify-between bg-white/70 dark:bg-slate-950/70 backdrop-blur-2xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm"
                    style={{ paddingTop: 'max(env(safe-area-inset-top), 3.5rem)' }}
                >
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-10 w-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full shadow-sm shrink-0">
                            <ArrowLeft size={20} className="text-slate-700 dark:text-slate-300" />
                        </Button>
                        <div className="flex flex-col">
                            <h1 className="text-[22px] leading-none font-black text-slate-900 dark:text-white tracking-tight">Settings</h1>
                            <p className="text-[13px] font-semibold text-slate-500 mt-1">Manage warehouses</p>
                        </div>
                    </div>
                </header>

                <main className="p-5 max-w-3xl mx-auto space-y-8 mt-2">

                    {/* Warehouses Section */}
                    <div className="space-y-5">
                        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 pl-4 rounded-[28px] border border-slate-200/60 dark:border-slate-800 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-[16px] flex items-center justify-center shadow-inner shadow-blue-400/20">
                                    <Building2 size={20} strokeWidth={2.5} />
                                </div>
                                <h2 className="text-[17px] font-black text-slate-900 dark:text-white tracking-tight">Hubs & Depots</h2>
                            </div>

                            <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
                                <SheetTrigger asChild>
                                    <Button size="sm" className="gap-2 h-11 rounded-[20px] px-5 shadow-sm bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 transition-all font-bold">
                                        <Plus size={18} strokeWidth={3} /> Add
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
                                                        // Auto-geocode after user stops typing (debounce)
                                                        const address = e.target.value
                                                        if (!address) return

                                                        // Use timeout to debounce
                                                        setTimeout(async () => {
                                                            if (address !== newHubAddress) return // User kept typing
                                                            try {
                                                                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
                                                                const data = await res.json()
                                                                if (data && data[0]) {
                                                                    setNewHubLoc({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
                                                                }
                                                            } catch (e) {
                                                                // Silent fail
                                                            }
                                                        }, 1000) // Wait 1 second after user stops typing
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
                            <div className="border-dashed border-2 border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 rounded-[32px] flex flex-col items-center justify-center py-20 text-center shadow-sm backdrop-blur-sm mx-2">
                                <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-5 rotate-3 border border-slate-200 dark:border-slate-700 shadow-sm">
                                    <Building2 className="h-8 w-8 text-slate-400 dark:text-slate-500" strokeWidth={2} />
                                </div>
                                <h3 className="text-[17px] font-black text-slate-800 dark:text-slate-200 tracking-tight">No hubs defined yet</h3>
                                <p className="text-[14px] font-medium text-slate-500 dark:text-slate-400 mt-2 max-w-[260px] leading-relaxed">Add a starting point for your drivers to optimize routing from the depot.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 mt-2">
                                {hubs.map(hub => (
                                    <div key={hub.id} className="group relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg transition-all rounded-[32px]">
                                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-20" />
                                        <div className="flex items-center p-5 gap-4">
                                            <div className="h-14 w-14 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-[20px] shadow-sm flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60">
                                                <Building2 size={24} className="text-blue-600 dark:text-blue-400 opacity-90" strokeWidth={2} />
                                            </div>
                                            <div className="flex-1 min-w-0 pr-2">
                                                <h3 className="text-[17px] font-black text-slate-900 dark:text-white tracking-tight truncate border-b border-transparent group-hover:border-slate-200 dark:group-hover:border-slate-800 pb-1 mb-1 transition-colors">{hub.name}</h3>
                                                <div className="flex items-start gap-1.5 mt-1">
                                                    <MapPin size={13} className="flex-shrink-0 text-slate-400 mt-0.5" strokeWidth={2.5} />
                                                    <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug">
                                                        {hub.address}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 h-12 w-12 flex items-center justify-center rounded-full transition-all flex-shrink-0 border border-transparent hover:border-rose-100 dark:hover:border-rose-900/50"
                                                onClick={() => handleDeleteHub(hub.id)}
                                            >
                                                <Trash2 size={20} strokeWidth={2} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Features Section */}
                    <div className="space-y-5">
                        <div className="flex items-center bg-white dark:bg-slate-900 p-2 pl-4 rounded-[28px] border border-slate-200/60 dark:border-slate-800 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-[16px] flex items-center justify-center shadow-inner shadow-emerald-400/20">
                                    <Settings2 size={20} strokeWidth={2.5} />
                                </div>
                                <h2 className="text-[17px] font-black text-slate-900 dark:text-white tracking-tight">Features</h2>
                            </div>
                        </div>

                        <div className="relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] rounded-[32px] overflow-hidden">
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-20" />

                            {/* Weight Tracking */}
                            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800/60">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="h-11 w-11 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-[16px] shadow-sm flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60">
                                        <Weight size={20} className="text-emerald-600 dark:text-emerald-400 opacity-90" strokeWidth={2} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">Enable Weight Tracking</h3>
                                        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Track order weight and vehicle capacity limits</p>
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
                            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800/60">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="h-11 w-11 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-[16px] shadow-sm flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60">
                                        <MapPinned size={20} className="text-blue-600 dark:text-blue-400 opacity-90" strokeWidth={2} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">Customer Tracking</h3>
                                        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Generate tracking links for customers to follow their deliveries</p>
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
                            <div className="flex items-center justify-between p-5">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="h-11 w-11 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-[16px] shadow-sm flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60">
                                        <Mail size={20} className="text-violet-600 dark:text-violet-400 opacity-90" strokeWidth={2} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">Email Notifications</h3>
                                        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Send email updates to customers when delivery status changes</p>
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
                </main>
            </div>
        </PullToRefresh>
    )
}
