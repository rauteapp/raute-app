"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { Menu, Navigation } from "lucide-react"
import { supabase, type Order, type Driver } from "@/lib/supabase"
import { isDriverOnline } from "@/lib/driver-status"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { FleetPanel } from "@/components/map/fleet-panel"

// Dynamically import the map component to avoid SSR issues
const InteractiveMap = dynamic(
    () => import("@/components/map/interactive-map"),
    {
        loading: () => (
            <div className="h-full w-full bg-muted/20 animate-pulse flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="h-12 w-12 bg-muted/40 rounded-lg mx-auto" />
                    <div className="h-4 w-24 bg-muted/40 rounded mx-auto" />
                </div>
            </div>
        ),
        ssr: false
    }
)

export default function MapPage() {
    const { theme } = useTheme()
    const searchParams = useSearchParams()

    // Data State
    const [orders, setOrders] = useState<Order[]>([])
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [companyId, setCompanyId] = useState<string | null>(null)

    // UI State
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(searchParams.get('driverId'))
    const [userLocation, setUserLocation] = useState<[number, number] | null>([34.0522, -118.2437]) // Default to generic location to avoid loading state
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false)

    // Initial Load & Subscription
    useEffect(() => {
        // Get User Location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => setUserLocation([position.coords.latitude, position.coords.longitude]),
                () => setUserLocation([30.0444, 31.2357]) // Default Cairo
            )
        } else {
            setUserLocation([30.0444, 31.2357])
        }

        // Timeout protection: don't let loading spin forever
        const timeoutId = setTimeout(() => {
            setIsLoading(false)
        }, 5000) // 5 seconds max

        fetchData().finally(() => {
            clearTimeout(timeoutId)
        })
    }, [])

    // Separate effect for Realtime subscriptions (company-scoped for scalability)
    useEffect(() => {
        if (!companyId) return // Wait for company_id

        const companyFilter = `company_id=eq.${companyId}`

        // Real-time Subscriptions (Company-scoped to prevent global broadcasts)
        const orderSub = supabase
            .channel(`orders-map-${companyId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'orders',
                filter: companyFilter // ✅ Scalability: Only this company
            }, () => fetchData())
            .subscribe()

        const driverSub = supabase
            .channel(`drivers-map-${companyId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'drivers',
                filter: companyFilter // ✅ Scalability: Only this company
            }, (payload) => {
                if (payload.new && (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT')) {
                    const newDriver = payload.new as Driver
                    setDrivers(prev => {
                        // Optimistic update for smooth animation
                        const exists = prev.find(d => d.id === newDriver.id)
                        if (exists) return prev.map(d => d.id === newDriver.id ? newDriver : d)
                        return [...prev, newDriver]
                    })
                }
            })
            .subscribe()

        return () => {
            orderSub.unsubscribe()
            driverSub.unsubscribe()
        }
    }, [companyId]) // Re-subscribe when company changes

    async function fetchData() {
        try {

            // 1. Try standard Supabase Auth
            let currentUserId = null

            // Retry logic for Supabase Auth
            let retries = 0
            const maxRetries = 3
            while (!currentUserId && retries < maxRetries) {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    currentUserId = user.id
                } else {
                    retries++
                    if (retries < maxRetries) await new Promise(r => setTimeout(r, 1000))
                }
            }



            if (!currentUserId) {
                setIsLoading(false)
                return
            }

            const { data: userProfile } = await supabase
                .from('users')
                .select('company_id, role')
                .eq('id', currentUserId)
                .maybeSingle()

            if (!userProfile) {
                console.log('❌ Map: No user profile found!');
                return
            }

            console.log('🗺️ Map fetchData:', {
                userId: currentUserId,
                role: userProfile.role,
                companyId: userProfile.company_id
            });

            setUserRole(userProfile.role) // Store user role
            setCompanyId(userProfile.company_id) // Store for Realtime filters

            // Driver: Only see own stuff
            if (userProfile.role === 'driver') {
                const { data: driverData } = await supabase
                    .from('drivers')
                    .select('*')  // Get full driver data including location
                    .eq('user_id', currentUserId)
                    .maybeSingle()

                if (driverData) {
                    setSelectedDriverId(driverData.id) // Auto-select self
                    setDrivers([driverData]) // Show own location on map

                    const { data } = await supabase
                        .from('orders')
                        .select('*')
                        .eq('driver_id', driverData.id)
                    setOrders(data || [])
                }
            } else {
                // Manager: See all active + today's delivered
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('company_id', userProfile.company_id)

                const { data: driversData, error: driversError } = await supabase
                    .from('drivers')
                    .select('*')
                    .eq('company_id', userProfile.company_id)

                // Filter logic: Hide delivered orders unless they are scheduled for TODAY
                // We use the user's local date to determine "Today"
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const todayString = `${year}-${month}-${day}`;

                console.log('📅 Date Filter:', todayString);

                const visibleOrders = (ordersData || []).filter(o => {
                    // Always show active orders (Pending, Assigned, In Progress)
                    if (o.status !== 'delivered' && o.status !== 'cancelled') return true;

                    // For Done orders (Delivered/Cancelled), ONLY show if delivery_date matches Today
                    // This prevents old history from cluttering the map (even if recently updated)
                    return o.delivery_date === todayString;
                });

                console.log('🗺️ Map drivers fetch result:', {
                    driversCount: driversData?.length || 0,
                    visibleOrders: visibleOrders.length,
                    totalOrders: ordersData?.length || 0,
                    todayString
                });

                // Derive online status from last_location_update (single source of truth)
                const processedDrivers = (driversData || []).map(driver => ({
                    ...driver,
                    is_online: isDriverOnline(driver)
                }))

                setOrders(visibleOrders)
                setDrivers(processedDrivers)
            }
        } catch (error) {
            // Error fetching map data
        } finally {
            setIsLoading(false)
        }
    }

    const handleDriverSelect = (id: string | null) => {
        setSelectedDriverId(id)
        setIsMobilePanelOpen(false) // Close sheet on mobile selection
    }

    // Calculate orders without GPS
    const ordersWithoutGPS = (() => {
        const displayedOrders = selectedDriverId
            ? orders.filter(o => o.driver_id === selectedDriverId)
            : orders
        return displayedOrders.filter(o => !o.latitude || !o.longitude)
    })()

    // Map Theme State
    const [mapTheme, setMapTheme] = useState<'light' | 'dark'>(() => {
        // Default to system theme match or light if prefer
        return theme === 'dark' ? 'dark' : 'light'
    })

    // Update map theme when system theme changes, unless user manually toggled? 
    // Actually simplicity: separate toggle means manual control usually. 
    // Let's just default to 'light' or match theme initially.

    // Toggle Button Handler
    const toggleMapTheme = () => {
        setMapTheme(prev => prev === 'light' ? 'dark' : 'light')
    }

    const handleOrderDeleted = (orderId: string) => {
        setOrders(prev => prev.filter(o => o.id !== orderId))
    }

    return (
        <div className="flex h-[calc(100vh-64px)] -mb-20 overflow-hidden bg-background relative safe-area-pl safe-area-pr">
            {/* Desktop Sidebar - Only for Managers */}
            {userRole === 'manager' && (
                <div className="hidden md:block w-80 shrink-0 h-full z-20 shadow-xl border-t">
                    <FleetPanel
                        drivers={drivers}
                        orders={orders}
                        selectedDriverId={selectedDriverId}
                        onSelectDriver={handleDriverSelect}
                    />
                </div>
            )}

            {/* Mobile Sheet Trigger - Only for Managers */}
            {userRole === 'manager' && (
                <div className="md:hidden absolute left-4 z-[400]" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
                    <Sheet open={isMobilePanelOpen} onOpenChange={setIsMobilePanelOpen}>
                        <SheetTrigger asChild>
                            <Button variant="secondary" size="icon" className="shadow-lg h-12 w-12 rounded-full border border-primary/20">
                                <Menu className="h-6 w-6" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="h-[60vh] p-0 rounded-t-xl z-[1000] sm:max-w-2xl mx-auto">
                            <SheetTitle className="sr-only">Fleet Overview</SheetTitle>
                            <FleetPanel
                                drivers={drivers}
                                orders={orders}
                                selectedDriverId={selectedDriverId}
                                onSelectDriver={handleDriverSelect}
                            />
                        </SheetContent>
                    </Sheet>
                </div>
            )}

            {/* Map Theme Toggle (Separate Button) */}
            <div className="absolute right-4 z-[400]" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
                <Button
                    variant="secondary"
                    size="icon"
                    className="shadow-lg h-10 w-10 rounded-full border border-primary/20 bg-background/80 backdrop-blur"
                    onClick={toggleMapTheme}
                    title="Toggle Map Theme"
                >
                    {mapTheme === 'dark' ? '🌙' : '☀️'}
                </Button>
            </div>

            {/* Main Map Area */}
            <div className="flex-1 relative h-full">
                <InteractiveMap
                    orders={orders}
                    drivers={drivers}
                    selectedDriverId={selectedDriverId}
                    userLocation={userLocation}
                    forceTheme={mapTheme}
                    onOrderDeleted={handleOrderDeleted}
                />

                {/* Info Overlay (Visible when Driver Selected) */}
                {selectedDriverId && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 md:left-6 md:translate-x-0 bg-background/90 backdrop-blur border border-border p-3 rounded-lg shadow-lg z-[400] max-w-[90vw] flex items-center gap-4">
                        <div className="text-sm">
                            <span className="text-muted-foreground mr-1">Focusing:</span>
                            <span className="font-bold">
                                {drivers.find(d => d.id === selectedDriverId)?.name || 'Driver'}
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setSelectedDriverId(null)}
                        >
                            Clear
                        </Button>
                    </div>
                )}

                {/* Warning for Orders Without GPS */}
                {ordersWithoutGPS.length > 0 && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-orange-500/90 backdrop-blur text-white px-4 py-2 rounded-lg shadow-lg z-[400] flex items-center gap-2 text-sm font-medium">
                        <span className="text-lg">⚠️</span>
                        <span>
                            {ordersWithoutGPS.length} order{ordersWithoutGPS.length > 1 ? 's' : ''} hidden (No GPS coordinates)
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
