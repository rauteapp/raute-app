'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { cacheData, getCachedData } from '@/lib/offline-cache'
import { waitForSession } from '@/lib/wait-for-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, CheckCircle2, Clock, Package, Truck, AlertCircle, AlertTriangle, TrendingUp, MapPin, ArrowRight, Calendar as CalendarIcon, Filter, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

import { useRouter, useSearchParams } from 'next/navigation'
import { SetupGuide } from '@/components/setup-guide'
import Link from 'next/link'
import { DriverDashboardView } from '@/components/dashboard/driver-dashboard-view'
import { format, isSameDay, startOfMonth, endOfMonth, subDays, startOfDay, endOfDay } from 'date-fns'
import { DateRange } from "react-day-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ManagerActivityFeed } from '@/components/manager-activity-feed'
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast-provider"
import { authenticatedFetch } from "@/lib/authenticated-fetch"
import { PullToRefresh } from "@/components/pull-to-refresh"

export default function DashboardPage() {
    const [isLoading, setIsLoading] = useState(true)
    const [orders, setOrders] = useState<any[]>([])
    const [filteredOrders, setFilteredOrders] = useState<any[]>([])
    const searchParams = useSearchParams()

    // Filter State — restore from URL if available, otherwise default to today
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        const from = searchParams.get('from')
        const to = searchParams.get('to')
        if (from) {
            return {
                from: new Date(from),
                to: to ? new Date(to) : new Date(from)
            }
        }
        return { from: new Date(), to: new Date() }
    })

    const [userRole, setUserRole] = useState<string | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        assigned: 0,
        inProgress: 0,
        delivered: 0,
        cancelled: 0
    })
    const [activeDriversCount, setActiveDriversCount] = useState(0)
    const [totalDriversCount, setTotalDriversCount] = useState(0)
    const [recentOrders, setRecentOrders] = useState<any[]>([])
    const [userName, setUserName] = useState('')
    const router = useRouter()
    const [hasHubs, setHasHubs] = useState(false)
    const [driversMap, setDriversMap] = useState<Record<string, any>>({})
    const [showSetup, setShowSetup] = useState(false) // Setup guide disabled - commented out for production
    const companyIdRef = useRef<string | null>(null)

    // Sync date range to URL so it persists on refresh
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (dateRange?.from) {
            params.set('from', format(dateRange.from, 'yyyy-MM-dd'))
            params.set('to', format(dateRange.to || dateRange.from, 'yyyy-MM-dd'))
        } else {
            params.delete('from')
            params.delete('to')
        }
        const newUrl = `${window.location.pathname}?${params.toString()}`
        window.history.replaceState({}, '', newUrl)
    }, [dateRange])
    const { toast } = useToast()
    const isMountedRef = useRef(true)

    useEffect(() => {

        isMountedRef.current = true

        // Session-aware init with retry for Capacitor async storage
        const initDashboard = async (): Promise<void> => {
            try {
                let session = await waitForSession()

                // On web, getSession() may time out due to navigator.locks but the user
                // IS authenticated (auth-check allows through via stored auth cookie).
                // Fall back to getUser() to get the user ID and proceed.
                let currentUserId: string | null = session?.user?.id ?? null
                let userMeta = session?.user?.user_metadata ?? {}

                if (!session && !currentUserId) {
                    try {
                        const { data: userData } = await supabase.auth.getUser()
                        if (userData.user) {
                            console.log('✅ Dashboard: session null but getUser() succeeded')
                            currentUserId = userData.user.id
                            userMeta = userData.user.user_metadata ?? {}
                        }
                    } catch {}
                }

                if (!currentUserId) {
                    // No session and no user — AuthCheck handles redirect
                    if (isMountedRef.current) setIsLoading(false)
                    return
                }

                // Get user role and full_name from database
                let role = userMeta?.role as string | undefined
                let fullName = userMeta?.full_name as string | undefined

                // Always fetch from DB to ensure we have the latest role
                const { data: dbUser, error: dbError } = await supabase
                    .from('users')
                    .select('role, full_name, company_id')
                    .eq('id', currentUserId)
                    .single()

                if (dbUser) {
                    role = dbUser.role || role
                    fullName = dbUser.full_name || fullName
                } else {
                    console.warn('⚠️ Direct DB query failed:', dbError?.message, '— trying fallback API...')
                    // FALLBACK: Use server-side API to bypass RLS
                    try {
                        const res = await authenticatedFetch('/api/user-profile')
                        if (res.ok) {
                            const apiData = await res.json()
                            if (apiData.success && apiData.user) {
                                role = apiData.user.role || role
                                fullName = apiData.user.full_name || fullName
                                console.log('✅ Fallback API succeeded:', apiData.user.role)
                            }
                        }
                    } catch (apiErr) {
                        console.warn('⚠️ Fallback API also failed:', apiErr)
                    }
                }

                // Final Fallback - default to manager (NOT driver)
                if (!role) role = 'manager'
                if (!fullName) fullName = session?.user?.email?.split('@')[0] || 'User'

                if (isMountedRef.current) {
                    setUserId(currentUserId)
                    setUserRole(role)
                    setUserName(fullName)
                }

                // 🔥 FETCH DASHBOARD DATA (For all management roles)
                if (['manager', 'dispatcher', 'admin', 'company_admin'].includes(role)) {
                    // Get company_id — try direct query first, then fallback API
                    let companyId = dbUser?.company_id || userMeta?.company_id

                    if (!companyId) {
                        // Fallback: use server-side API
                        try {
                            const res = await authenticatedFetch('/api/user-profile')
                            if (res.ok) {
                                const apiData = await res.json()
                                if (apiData.success && apiData.user) {
                                    companyId = apiData.user.company_id
                                }
                            }
                        } catch {}
                    }

                    if (companyId) {
                        companyIdRef.current = companyId
                        // Fetch orders for this company (capped at 500 for performance)
                        const { data: ordersData, error: ordersError } = await supabase
                            .from('orders')
                            .select('*')
                            .eq('company_id', companyId)
                            .order('created_at', { ascending: false })
                            .limit(500)

                        if (ordersData && !ordersError) {
                            setOrders(ordersData)
                            cacheData('orders', ordersData).catch(() => {})

                            // Calculate stats
                            const statsCalc = {
                                total: ordersData.length,
                                pending: ordersData.filter(o => o.status === 'pending').length,
                                assigned: ordersData.filter(o => o.status === 'assigned').length,
                                inProgress: ordersData.filter(o => o.status === 'in_progress').length,
                                delivered: ordersData.filter(o => o.status === 'delivered').length,
                                cancelled: ordersData.filter(o => o.status === 'cancelled').length
                            }
                            setStats(statsCalc)
                        } else if (ordersError) {
                            // Offline fallback: load from IDB
                            const cached = await getCachedData('orders', {
                                filter: (o: any) => o.company_id === companyId
                            })
                            if (cached.length > 0) {
                                setOrders(cached as any)
                                const statsCalc = {
                                    total: cached.length,
                                    pending: cached.filter((o: any) => o.status === 'pending').length,
                                    assigned: cached.filter((o: any) => o.status === 'assigned').length,
                                    inProgress: cached.filter((o: any) => o.status === 'in_progress').length,
                                    delivered: cached.filter((o: any) => o.status === 'delivered').length,
                                    cancelled: cached.filter((o: any) => o.status === 'cancelled').length
                                }
                                setStats(statsCalc)
                            }
                        }

                        // Fetch Drivers
                        const { data: driversData } = await supabase
                            .from('drivers')
                            .select('*')
                            .eq('company_id', companyId)

                        if (driversData) {
                            setTotalDriversCount(driversData.length)
                            cacheData('drivers', driversData).catch(() => {})
                            // Build drivers map for quick lookup
                            const dMap: Record<string, any> = {}
                            driversData.forEach(d => {
                                dMap[d.id] = { name: d.name, vehicle_type: d.vehicle_type, vehicle: d.vehicle_type }
                            })
                            setDriversMap(dMap)
                        }

                        // Fetch Hubs
                        const { data: hubsData } = await supabase
                            .from('hubs')
                            .select('id')
                            .eq('company_id', companyId)

                        if (hubsData) {
                            setHasHubs(hubsData.length > 0)
                            cacheData('hubs', hubsData).catch(() => {})
                        }
                    }
                }

                if (isMountedRef.current) {
                    setIsLoading(false)
                }
            } catch (error) {
                console.error('Dashboard Init Error:', error)
                if (isMountedRef.current) {
                    setIsLoading(false)
                }
            }
        }

        initDashboard()

        return () => {

            isMountedRef.current = false
        }
    }, [])

    // Reusable refresh function for both focus + pull-to-refresh
    const refreshDashboard = async () => {
        const companyId = companyIdRef.current
        if (!companyId) return

        try {
            const { data: ordersData } = await supabase
                .from('orders')
                .select('*')
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
                .limit(500)

            if (ordersData) {
                setOrders(ordersData)
                const statsCalc = {
                    total: ordersData.length,
                    pending: ordersData.filter(o => o.status === 'pending').length,
                    assigned: ordersData.filter(o => o.status === 'assigned').length,
                    inProgress: ordersData.filter(o => o.status === 'in_progress').length,
                    delivered: ordersData.filter(o => o.status === 'delivered').length,
                    cancelled: ordersData.filter(o => o.status === 'cancelled').length
                }
                setStats(statsCalc)
            }

            const { data: driversData } = await supabase
                .from('drivers')
                .select('*')
                .eq('company_id', companyId)

            if (driversData) {
                setTotalDriversCount(driversData.length)
                const dMap: Record<string, any> = {}
                driversData.forEach(d => {
                    dMap[d.id] = { name: d.name, vehicle_type: d.vehicle_type, vehicle: d.vehicle_type }
                })
                setDriversMap(dMap)
            }

            const { data: hubsData } = await supabase
                .from('hubs')
                .select('id')
                .eq('company_id', companyId)

            if (hubsData) {
                setHasHubs(hubsData.length > 0)
            }
        } catch (error) {
            console.error('Error refreshing dashboard data:', error)
        }
    }

    // Auto-refresh when user returns to dashboard
    useEffect(() => {
        const handleFocus = () => {
            if (!userId || !['manager', 'dispatcher', 'admin', 'company_admin'].includes(userRole || '')) return
            refreshDashboard()
        }

        window.addEventListener('focus', handleFocus)
        return () => window.removeEventListener('focus', handleFocus)
    }, [userId, userRole])

    // 🔔 REALTIME: Alert manager on suspicious deliveries
    useEffect(() => {
        if (!companyIdRef.current || !['manager', 'dispatcher', 'admin', 'company_admin'].includes(userRole || '')) return

        const channel = supabase
            .channel(`dashboard-suspicious-${companyIdRef.current}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'orders',
                filter: `company_id=eq.${companyIdRef.current}`
            }, (payload) => {
                const newOrder = payload.new as any
                const oldOrder = payload.old as any
                // Alert when an order just got flagged as out of range
                if (newOrder.was_out_of_range && !oldOrder?.was_out_of_range) {
                    toast({
                        title: "⚠️ Suspicious Delivery",
                        description: `Order #${newOrder.order_number || newOrder.id?.slice(0, 8)} was delivered ${newOrder.delivery_distance_meters ? Math.round(newOrder.delivery_distance_meters) + 'm' : 'far'} from destination`,
                        type: "error"
                    })
                    // Refresh orders to update the alert banner
                    setOrders(prev => prev.map(o => o.id === newOrder.id ? { ...o, ...newOrder } : o))
                }
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [userId, userRole])

    // ✅ QUICK SETUP COMPLETION CHECK - Auto-hide when all steps are complete
    useEffect(() => {
        if (userRole !== 'manager') return

        const setupComplete = totalDriversCount > 0 && stats.total > 0 && hasHubs
        if (setupComplete && showSetup) {
            setShowSetup(false) // Hide guide when all steps done
        }
    }, [userId, userRole, totalDriversCount, stats.total, hasHubs, showSetup])

    // 📅 DATE FILTER & STATS CALCULATION
    useEffect(() => {
        if (!orders.length) {
            setFilteredOrders([])
            setStats({ total: 0, pending: 0, assigned: 0, inProgress: 0, delivered: 0, cancelled: 0 })
            return
        }

        let filtered = orders

        if (dateRange?.from) {
            const start = startOfDay(dateRange.from)
            const end = endOfDay(dateRange.to || dateRange.from)

            filtered = orders.filter(order => {
                const d = new Date(order.updated_at || order.delivered_at || order.created_at)
                return d >= start && d <= end
            })
        }

        setFilteredOrders(filtered)

        // Recalculate Stats based on FILTERED view (Selected Period)
        const pendingCount = filtered.filter(o => o.status === 'pending').length
        const cancelledCount = filtered.filter(o => o.status === 'cancelled').length

        setStats({
            total: filtered.length,
            pending: pendingCount,
            assigned: filtered.filter(o => o.status === 'assigned').length,
            inProgress: filtered.filter(o => o.status === 'in_progress').length,
            delivered: filtered.filter(o => o.status === 'delivered').length,
            cancelled: cancelledCount + pendingCount // Treat Unassigned (Pending) as Issues
        })

    }, [dateRange, orders])


    const getGreeting = () => {
        const hour = new Date().getHours()
        if (hour < 12) return 'Good Morning'
        if (hour < 18) return 'Good Afternoon'
        return 'Good Evening'
    }

    const isToday = dateRange?.from && isSameDay(dateRange.from, new Date()) && (!dateRange.to || isSameDay(dateRange.to, new Date()))
    const isRange = dateRange?.from && dateRange.to && !isSameDay(dateRange.from, dateRange.to)

    if (isLoading) return <DashboardSkeleton />

    // 🚚 DRIVER VIEW - RENDER DASHBOARD
    if (userRole === 'driver') {
        return <DriverDashboardView userId={userId || ''} />
    }

    // If no role set yet, keep loading
    if (!userRole) {
        return <DashboardSkeleton />
    }

    // 👔 MANAGER VIEW
    return (
        <PullToRefresh onRefresh={refreshDashboard}>
        <div className="p-4 space-y-6 pb-4 max-w-7xl mx-auto min-h-screen bg-slate-50/50 dark:bg-slate-950 transition-colors safe-area-pt">
            {/* 0. SETUP GUIDE (Conditional - Managers Only) */}
            {showSetup && userRole === 'manager' && (
                <div className="relative">
                    <button onClick={() => setShowSetup(false)} className="absolute top-2 right-2 p-2 text-slate-400 dark:text-slate-500 hover:text-white z-10"><X size={16} /></button>
                    <SetupGuide
                        hasDrivers={totalDriversCount > 0}
                        hasOrders={stats.total > 0}
                        hasHubs={hasHubs}
                        hasOptimizedOrders={stats.assigned > 0 || stats.inProgress > 0}
                    />
                </div>
            )}


            {/* 1. HEADER & CONTROLS */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                        {isToday ? getGreeting() : "Report View"}, {userName.split(' ')[0]}! 👋
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2 mt-1">
                        {isToday ? "Live Operations Overview" :
                            isRange ? `Period Report: ${format(dateRange?.from!, 'MMM d')} - ${format(dateRange?.to!, 'MMM d, yyyy')}` :
                                `Historical Report for ${format(dateRange?.from || new Date(), 'MMM dd, yyyy')}`}
                        {isToday && <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {/* DATE PICKER */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("justify-start text-left font-normal w-full md:w-[260px] dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200", !dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                            {format(dateRange.from, "LLL dd, y")} -{" "}
                                            {format(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                ) : (
                                    <span>Pick a date range</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                                <h4 className="font-bold text-xs text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Quick Select</h4>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1 bg-slate-50 dark:bg-slate-900" onClick={() => setDateRange({ from: new Date(), to: new Date() })}>Today</Button>
                                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1 bg-slate-50 dark:bg-slate-900" onClick={() => setDateRange({ from: subDays(new Date(), 6), to: new Date() })}>Last 7 Days</Button>
                                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1 bg-slate-50 dark:bg-slate-900" onClick={() => setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })}>This Month</Button>
                                </div>
                            </div>
                            <Calendar
                                mode="range"
                                selected={dateRange}
                                onSelect={setDateRange}
                                disabled={(date) => date > new Date() || date < new Date("2024-01-01")}
                                initialFocus
                            />
                            <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center">
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                    💡 Tip: Click start date, then click end date to select a range.
                                </p>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <button onClick={() => router.push('/orders')} className="hidden sm:inline-flex md:flex-none items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors h-10">
                        <Package className="mr-2 h-4 w-4" /> Orders
                    </button>
                    <button onClick={() => router.push('/planner')} className="flex-1 md:flex-none inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 transition-colors h-10 whitespace-nowrap">
                        <MapPin className="mr-2 h-4 w-4" /> Route Planner
                    </button>
                </div>
            </div>

            {/* 2. ALERT BANNER */}
            {stats.pending > 0 && isToday && (
                <div onClick={() => router.push('/planner')} className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors group shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center shadow-inner">
                            <AlertCircle size={20} className="animate-pulse" />
                        </div>
                        <div>
                            <h3 className="font-bold text-amber-900 dark:text-amber-100">Action Required: {stats.pending} New Orders</h3>
                            <p className="text-amber-700 dark:text-amber-300 text-xs sm:text-sm">Assign these orders to drivers to begin delivery.</p>
                        </div>
                    </div>
                    <ArrowRight className="text-amber-500 group-hover:translate-x-1 transition-transform" />
                </div>
            )}

            {/* 2b. SUSPICIOUS DELIVERY ALERT */}
            {(() => {
                const suspiciousCount = orders.filter((o: any) => o.was_out_of_range && o.status === 'delivered').length
                return suspiciousCount > 0 ? (
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center shadow-inner">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-red-900 dark:text-red-100">{suspiciousCount} Suspicious Deliver{suspiciousCount === 1 ? 'y' : 'ies'}</h3>
                                <p className="text-red-700 dark:text-red-300 text-xs sm:text-sm">Orders delivered outside the expected zone (&gt;500m away)</p>
                            </div>
                        </div>
                    </div>
                ) : null
            })()}

            {/* 3. METRICS GRID */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard title="Total Volume" value={stats.total} icon={Package} color="text-slate-600 dark:text-slate-400" bg="bg-slate-100 dark:bg-slate-800" />
                <StatsCard title="In Progress" value={stats.inProgress + stats.assigned} icon={Truck} color="text-blue-600 dark:text-blue-400" bg="bg-blue-100 dark:bg-blue-900/30" />
                <StatsCard title="Completed" value={stats.delivered} icon={CheckCircle2} color="text-green-600 dark:text-green-400" bg="bg-green-100 dark:bg-green-900/30" />
                <StatsCard title="Issues/Cancel" value={stats.cancelled} icon={AlertCircle} color="text-red-600 dark:text-red-400" bg="bg-red-100 dark:bg-red-900/30" />
            </div>

            {/* 4. MAIN CONTENT AREA */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* A. FLEET PERFORMANCE (Left 2 Col) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                            <Truck className="text-blue-600 dark:text-blue-400" size={20} />
                            {isToday ? "Live Fleet Status" : "Driver Performance Log"}
                        </h2>
                        {isToday && (
                            <span className="text-[10px] font-bold bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
                            </span>
                        )}
                    </div>

                    <div className="grid gap-3">
                        {/* Group Orders by Driver */}
                        {(() => {
                            const driverStats = filteredOrders.reduce((acc: any, order: any) => {
                                if (!order.driver_id) return acc;
                                if (!acc[order.driver_id]) {
                                    // lookup driver details from map
                                    const dInfo = driversMap[order.driver_id] || { name: 'Unknown Driver', vehicle_type: 'Truck' }
                                    acc[order.driver_id] = { ...dInfo, total: 0, completed: 0, failed: 0, id: order.driver_id };
                                }
                                acc[order.driver_id].total++;
                                if (order.status === 'delivered') acc[order.driver_id].completed++;
                                if (order.status === 'cancelled') acc[order.driver_id].failed++;
                                return acc;
                            }, {});

                            const driversList = Object.values(driverStats);

                            if (driversList.length === 0) {
                                return (
                                    <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/50">
                                        <Truck className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                                        <p className="text-slate-500 dark:text-slate-400 font-medium">No active drivers found for this date.</p>
                                    </div>
                                )
                            }

                            return driversList.map((driver: any, idx) => (
                                <DriverProgressCard key={driver.id || idx} driver={driver} index={idx} />
                            ))
                        })()}
                    </div>
                </div>

                {/* B. RECENT ACTIVITY (Right Col) */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                        <Activity className="text-purple-600 dark:text-purple-400" size={20} />
                        Latest Updates
                    </h2>
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[300px] flex flex-col">
                        <Tabs defaultValue="orders" className="w-full flex-1 flex flex-col">
                            <div className="px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="orders">Orders</TabsTrigger>
                                    <TabsTrigger value="activity">Driver Logs</TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="orders" className="flex-1 overflow-y-auto max-h-[400px] p-0 m-0">
                                {filteredOrders.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm flex flex-col items-center justify-center h-full">
                                        <Clock className="mb-2 opacity-50" />
                                        No activity recorded
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                        {filteredOrders.slice(0, 10).map((order) => (
                                            <div key={order.id} className="p-4 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                                                <div className={cn("mt-1.5 h-2 w-2 rounded-full flex-shrink-0 shadow-sm",
                                                    order.status === 'delivered' ? 'bg-green-500' :
                                                        order.status === 'assigned' ? 'bg-blue-500' :
                                                            order.status === 'in_progress' ? 'bg-purple-500' : 'bg-yellow-500'
                                                )} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                        {order.customer_name}
                                                    </p>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between mt-0.5">
                                                        <span>{order.status.replace('_', ' ')}</span>
                                                        <div className="flex items-center gap-2">
                                                            {/* Suspicious Delivery Warning */}
                                                            {(order as any).was_out_of_range && (
                                                                <span title="Driver was far from location!" className="flex items-center gap-1 text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-bold">
                                                                    <AlertCircle size={10} /> Suspicious
                                                                </span>
                                                            )}

                                                            <span className={cn("font-mono transition-opacity flex items-center gap-1",
                                                                !isSameDay(new Date(order.updated_at || order.created_at), new Date()) ? "text-red-500 font-bold" : "opacity-70 group-hover:opacity-100"
                                                            )}>
                                                                {order.status === 'delivered' && order.delivered_at ? (
                                                                    <>
                                                                        <CheckCircle2 size={10} className="text-green-500" />
                                                                        {format(new Date(order.delivered_at), 'HH:mm')}
                                                                    </>
                                                                ) : (
                                                                    !isSameDay(new Date(order.updated_at || order.created_at), new Date())
                                                                        ? format(new Date(order.updated_at || order.created_at), 'MMM dd, HH:mm')
                                                                        : new Date(order.updated_at || order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="activity" className="flex-1 overflow-y-auto max-h-[400px] p-4 m-0">
                                <ManagerActivityFeed dateRange={dateRange} />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </div>
        </PullToRefresh>
    )
}

function DriverProgressCard({ driver, index }: { driver: any, index: number }) {
    const percentage = Math.round((driver.completed / driver.total) * 100) || 0

    return (
        <Link href={`/map?driverId=${driver.id}`} prefetch={false}>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all cursor-pointer group relative">
                {/* Hover Indicator */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <MapPin size={10} /> Track Live
                </div>

                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl shrink-0 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
                    {driver.vehicle === 'Truck' ? '🚛' : driver.vehicle === 'Van' ? 'mw' : '👨‍✈️'}
                </div>
                <div className="flex-1">
                    <div className="flex justify-between mb-1">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">{driver.name}</h3>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{driver.completed}/{driver.total} Stops</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${percentage === 100 ? 'bg-green-500' : 'bg-blue-600'}`}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>
                </div>
                <div className="text-center min-w-[3rem]">
                    <span className={`text-sm font-bold ${percentage === 100 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                        {percentage}%
                    </span>
                </div>
            </div>
        </Link>
    )
}

function StatsCard({ title, value, icon: Icon, color, bg }: any) {
    return (
        <div className="bg-card dark:bg-slate-900 text-card-foreground p-4 rounded-xl shadow-sm border border-border dark:border-slate-800 flex flex-col justify-between h-28 relative overflow-hidden group">
            <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform duration-500 ${color}`}>
                <Icon size={64} />
            </div>
            <div className={`h-10 w-10 ${bg} ${color} rounded-lg flex items-center justify-center mb-2`}>
                <Icon size={20} />
            </div>
            <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{title}</p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
        </div>
    )
}

function DashboardSkeleton() {
    return (
        <div className="p-4 space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
                <Skeleton className="h-64 rounded-xl" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-6 w-32" />
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
        </div>
    )
}
