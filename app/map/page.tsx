"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { Menu, Navigation } from "lucide-react"
import { supabase, type Order, type Driver } from "@/lib/supabase"
import { isDriverOnline } from "@/lib/driver-status"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { FleetPanel, type DriverFilter } from "@/components/map/fleet-panel"

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
    const isMountedRef = useRef(true)

    // Data State
    const [orders, setOrders] = useState<Order[]>([])
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [companyId, setCompanyId] = useState<string | null>(null)

    // UI State — multi-select drivers + filter
    const initialDriverId = searchParams.get('driverId')
    const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(
        initialDriverId ? new Set([initialDriverId]) : new Set()
    )
    const [driverFilter, setDriverFilter] = useState<DriverFilter>('all')
    const [userLocation, setUserLocation] = useState<[number, number] | null>([34.0522, -118.2437])
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false)

    // Initial Load & Subscription
    useEffect(() => {
        isMountedRef.current = true

        // Get User Location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    if (isMountedRef.current) {
                        setUserLocation([position.coords.latitude, position.coords.longitude])
                    }
                },
                () => {
                    if (isMountedRef.current) {
                        setUserLocation([30.0444, 31.2357]) // Default Cairo
                    }
                }
            )
        } else {
            setUserLocation([30.0444, 31.2357])
        }

        // Timeout protection: don't let loading spin forever
        const timeoutId = setTimeout(() => {
            if (isMountedRef.current) setIsLoading(false)
        }, 5000) // 5 seconds max

        fetchData().finally(() => {
            clearTimeout(timeoutId)
        })

        return () => {
            isMountedRef.current = false
        }
    }, [])

    // Track last Realtime event for fallback polling
    const lastRealtimeEventRef = useRef<number>(Date.now())

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
                filter: companyFilter
            }, () => {
                if (!isMountedRef.current) return
                lastRealtimeEventRef.current = Date.now()
                fetchData()
            })
            .subscribe()

        const driverSub = supabase
            .channel(`drivers-map-${companyId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'drivers',
                filter: companyFilter
            }, (payload) => {
                if (!isMountedRef.current) return
                lastRealtimeEventRef.current = Date.now()
                if (payload.new && (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT')) {
                    const newDriver = payload.new as Driver
                    newDriver.is_online = isDriverOnline(newDriver)
                    setDrivers(prev => {
                        const exists = prev.find(d => d.id === newDriver.id)
                        if (exists) return prev.map(d => d.id === newDriver.id ? newDriver : d)
                        return [...prev, newDriver]
                    })
                }
            })
            .subscribe()

        // Fallback polling: if Realtime goes silent for 30s+, poll every 20s
        const FALLBACK_POLL_INTERVAL = 20_000
        const REALTIME_STALE_THRESHOLD = 30_000

        const pollIntervalId = setInterval(async () => {
            if (!isMountedRef.current) return
            const timeSinceLastEvent = Date.now() - lastRealtimeEventRef.current
            if (timeSinceLastEvent > REALTIME_STALE_THRESHOLD) {
                const { data } = await supabase
                    .from('drivers')
                    .select('*')
                    .eq('company_id', companyId)
                if (data && isMountedRef.current) {
                    setDrivers(data.map(d => ({ ...d, is_online: isDriverOnline(d) })))
                }
            }
        }, FALLBACK_POLL_INTERVAL)

        return () => {
            orderSub.unsubscribe()
            driverSub.unsubscribe()
            clearInterval(pollIntervalId)
        }
    }, [companyId])

    async function fetchData() {
        try {
            // 1. Try standard Supabase Auth
            let currentUserId = null

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

            if (!isMountedRef.current) return

            const { data: userProfile } = await supabase
                .from('users')
                .select('company_id, role')
                .eq('id', currentUserId)
                .maybeSingle()

            if (!userProfile) {
                return
            }

            if (!isMountedRef.current) return

            setUserRole(userProfile.role)
            setCompanyId(userProfile.company_id)

            // Driver: Only see own stuff
            if (userProfile.role === 'driver') {
                const { data: driverData } = await supabase
                    .from('drivers')
                    .select('*')
                    .eq('user_id', currentUserId)
                    .maybeSingle()

                if (driverData && isMountedRef.current) {
                    setSelectedDriverIds(new Set([driverData.id]))
                    setDrivers([driverData])

                    const { data } = await supabase
                        .from('orders')
                        .select('*')
                        .eq('driver_id', driverData.id)
                    if (isMountedRef.current) setOrders(data || [])
                }
            } else {
                // Manager: See all active + today's delivered
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('company_id', userProfile.company_id)

                const { data: driversData } = await supabase
                    .from('drivers')
                    .select('*')
                    .eq('company_id', userProfile.company_id)

                if (!isMountedRef.current) return

                // Filter: Hide delivered orders unless scheduled for TODAY
                const now = new Date()
                const todayString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

                const visibleOrders = (ordersData || []).filter(o => {
                    if (o.status !== 'delivered' && o.status !== 'cancelled') return true
                    return o.delivery_date === todayString
                })

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

    const handleSelectDrivers = (ids: Set<string>) => {
        setSelectedDriverIds(ids)
        // Close mobile panel if selecting specific drivers
        if (ids.size > 0) setIsMobilePanelOpen(false)
    }

    // Calculate orders without GPS
    const ordersWithoutGPS = (() => {
        if (selectedDriverIds.size > 0) {
            return orders
                .filter(o => (o.driver_id && selectedDriverIds.has(o.driver_id)) || !o.driver_id)
                .filter(o => !o.latitude || !o.longitude)
        }
        return orders.filter(o => !o.latitude || !o.longitude)
    })()

    // Map Theme State
    const [mapTheme, setMapTheme] = useState<'light' | 'dark'>(() => {
        return theme === 'dark' ? 'dark' : 'light'
    })

    const toggleMapTheme = () => {
        setMapTheme(prev => prev === 'light' ? 'dark' : 'light')
    }

    const handleOrderDeleted = (orderId: string) => {
        setOrders(prev => prev.filter(o => o.id !== orderId))
    }

    // Get selected driver names for overlay
    const selectedDriverNames = Array.from(selectedDriverIds)
        .map(id => drivers.find(d => d.id === id)?.name)
        .filter(Boolean)

    return (
        <div className="flex overflow-hidden bg-background relative -mb-16" style={{ height: 'calc(100dvh - env(safe-area-inset-bottom, 0px))', minHeight: 0 }} >
            {/* Desktop Sidebar - Only for Managers */}
            {userRole === 'manager' && (
                <div className="hidden md:block w-80 shrink-0 h-full z-20 shadow-xl border-t">
                    <FleetPanel
                        drivers={drivers}
                        orders={orders}
                        selectedDriverIds={selectedDriverIds}
                        onSelectDrivers={handleSelectDrivers}
                        driverFilter={driverFilter}
                        onFilterChange={setDriverFilter}
                    />
                </div>
            )}

            {/* Mobile Sheet Trigger - Only for Managers */}
            {userRole === 'manager' && (
                <div className="md:hidden absolute left-4 z-[400]" style={{ top: 'calc(var(--safe-area-inset-top, 0px) + 1rem)' }}>
                    <Sheet open={isMobilePanelOpen} onOpenChange={setIsMobilePanelOpen}>
                        <SheetTrigger asChild>
                            <Button variant="secondary" size="icon" className="shadow-lg h-12 w-12 rounded-full border border-primary/20">
                                <Menu className="h-6 w-6" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="h-[65vh] p-0 rounded-t-[32px] z-[1000] sm:max-w-2xl mx-auto border-t border-slate-200/50 dark:border-slate-800/50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                            <SheetTitle className="sr-only">Fleet Overview</SheetTitle>
                            <FleetPanel
                                drivers={drivers}
                                orders={orders}
                                selectedDriverIds={selectedDriverIds}
                                onSelectDrivers={handleSelectDrivers}
                                driverFilter={driverFilter}
                                onFilterChange={setDriverFilter}
                            />
                        </SheetContent>
                    </Sheet>
                </div>
            )}

            {/* Map Theme Toggle */}
            <div className="absolute right-4 z-[400]" style={{ top: 'calc(var(--safe-area-inset-top, 0px) + 1rem)' }}>
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
                    selectedDriverIds={selectedDriverIds}
                    driverFilter={driverFilter}
                    userLocation={userLocation}
                    forceTheme={mapTheme}
                    onOrderDeleted={handleOrderDeleted}
                />

                {/* Info Overlay (Visible when drivers selected) */}
                {selectedDriverIds.size > 0 && (
                    <div className="absolute bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 md:left-6 md:translate-x-0 bg-background/90 backdrop-blur border border-border p-3 rounded-lg shadow-lg z-[500] max-w-[90vw] flex items-center gap-4">
                        <div className="text-sm">
                            <span className="text-muted-foreground mr-1">Tracking:</span>
                            <span className="font-bold">
                                {selectedDriverIds.size === 1
                                    ? selectedDriverNames[0] || 'Driver'
                                    : `${selectedDriverIds.size} drivers`
                                }
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setSelectedDriverIds(new Set())}
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
