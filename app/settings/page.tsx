"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet"
import { Plus, MapPin, Building2, Trash2, ArrowLeft, Save, Search } from "lucide-react"
import LocationPicker from "@/components/location-picker"
import { useToast } from "@/components/toast-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { PullToRefresh } from "@/components/pull-to-refresh"

interface Hub {
    id: string
    name: string
    address: string
    latitude: number
    longitude: number
}

export default function SettingsPage() {
    const router = useRouter()
    const { toast } = useToast()
    const [hubs, setHubs] = useState<Hub[]>([])
    const [loading, setLoading] = useState(true)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [saving, setSaving] = useState(false)

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
                const { data, error } = await supabase
                    .from('hubs')
                    .select('*')
                    .eq('company_id', userProfile.company_id)
                    .order('created_at', { ascending: false })

                if (error) throw error
                setHubs(data || [])
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
            <div className="min-h-screen bg-slate-50 pb-4">
                <header className="ios-header sticky top-0 z-10 px-4 py-4 flex items-center justify-between safe-area-pt">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => router.back()}>
                            <ArrowLeft size={20} />
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold">Company Settings</h1>
                            <p className="text-xs text-muted-foreground">Manage warehouses & details</p>
                        </div>
                    </div>
                </header>

                <main className="p-4 max-w-3xl mx-auto space-y-6">

                    {/* Warehouses Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                                    <Building2 size={18} />
                                </div>
                                <h2 className="text-lg font-bold text-slate-800">Warehouses / Hubs</h2>
                            </div>

                            <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
                                <SheetTrigger asChild>
                                    <Button size="sm" className="gap-2">
                                        <Plus size={16} /> Add New
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-6 overflow-y-auto safe-area-pt">
                                    <SheetHeader className="mb-6">
                                        <SheetTitle>Add New Warehouse</SheetTitle>
                                        <SheetDescription> Define a new start location for your fleet.</SheetDescription>
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
                                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
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
                                                    <p className="text-xs text-blue-600 mt-2 flex items-center gap-1 font-medium">
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
                            <Card className="border-dashed border-2 bg-slate-50/50">
                                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                    <Building2 className="h-12 w-12 text-slate-300 mb-3" />
                                    <h3 className="text-sm font-bold text-slate-500">No warehouses defined</h3>
                                    <p className="text-xs text-slate-400 max-w-[200px] mt-1">Add your depots or parking lots to easily assign drivers.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-3">
                                {hubs.map(hub => (
                                    <Card key={hub.id} className="group overflow-hidden">
                                        <div className="flex items-center p-4 gap-4">
                                            <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                                                <Building2 size={20} className="text-slate-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-slate-900 truncate">{hub.name}</h3>
                                                <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                                                    <MapPin size={10} /> {hub.address}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                onClick={() => handleDeleteHub(hub.id)}
                                            >
                                                <Trash2 size={18} />
                                            </Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </PullToRefresh>
    )
}
