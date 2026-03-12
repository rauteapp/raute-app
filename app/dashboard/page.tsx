'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, CheckCircle2, Clock, Package, Truck, AlertCircle, AlertTriangle, TrendingUp, MapPin, ArrowRight, Calendar as CalendarIcon, Filter, X, Sparkles, User } from 'lucide-react'
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
import { PushService } from "@/lib/push-service"
import { NotificationBell } from "@/components/notification-bell"

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

        let isInitDone = false

        // Global safety timeout to prevent endless skeleton loader if Supabase hangs
        // 15s allows: ~4s auth + ~5s user query + ~5s parallel data queries on slow mobile networks
        const maxWaitGlobal = setTimeout(() => {
            if (isMountedRef.current && !isInitDone) {
                setIsLoading(false)
                toast({ title: "Connection Timeout", description: "Database is taking too long to respond. Some data may be missing.", type: "error" })
            }
        }, 15000)

        // Session-aware init — run getSession() and getUser() in parallel for speed.
        // getSession() may hang due to navigator.locks, but getUser() bypasses locks.
        const initDashboard = async (): Promise<void> => {
            try {
                let currentUserId: string | null = null
                let userMeta: Record<string, any> = {}
                let session: any = null

                try {
                    const [sessionResult, userResult] = await Promise.allSettled([
                        Promise.race([
                            supabase.auth.getSession(),
                            new Promise<{ data: { session: null } }>((resolve) =>
                                setTimeout(() => resolve({ data: { session: null } }), 4000)
                            ),
                        ]),
                        Promise.race([
                            supabase.auth.getUser(),
                            new Promise<{ data: { user: null } }>((resolve) =>
                                setTimeout(() => resolve({ data: { user: null } }), 4000)
                            ),
                        ]),
                    ])

                    if (sessionResult.status === 'fulfilled') {
                        const s = (sessionResult.value as any)?.data?.session
                        if (s?.user?.id) {
                            session = s
                            currentUserId = s.user.id
                            userMeta = s.user.user_metadata ?? {}
                        }
                    }

                    if (!currentUserId && userResult.status === 'fulfilled') {
                        const u = (userResult.value as any)?.data?.user
                        if (u?.id) {
                                currentUserId = u.id
                            userMeta = u.user_metadata ?? {}
                        }
                    }
                } catch {
                    // Both failed
                }

                if (!currentUserId) {
                    const cachedRole = typeof window !== 'undefined' ? localStorage.getItem('raute_user_role') : null
                    if (cachedRole) {
                        if (isMountedRef.current) setIsLoading(false)
                        return
                    }
                    console.error('⛔ Dashboard: No session, no cache. Redirecting to login.')
                    router.replace('/login?error=no_session')
                    return
                }

                // Get user role and full_name from database
                let role = userMeta?.role as string | undefined
                let fullName = userMeta?.full_name as string | undefined

                // Always fetch from DB to ensure we have the latest role
                // Add a timeout to prevent hanging if the database is unresponsive
                let dbUser: any = null
                let dbError: any = null

                try {
                    const result: any = await Promise.race([
                        supabase
                            .from('users')
                            .select('role, full_name, company_id')
                            .eq('id', currentUserId)
                            .single(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Database query timed out')), 5000)
                        )
                    ])
                    dbUser = result.data
                    dbError = result.error
                } catch (err: any) {
                    dbError = err
                }

                if (dbUser) {
                    role = dbUser.role || role
                    fullName = dbUser.full_name || fullName
                } else {
                    // FALLBACK: Use server-side API to bypass RLS
                    try {
                        const res = await authenticatedFetch('/api/user-profile')
                        if (res.ok) {
                            const apiData = await res.json()
                            if (apiData.success && apiData.user) {
                                role = apiData.user.role || role
                                fullName = apiData.user.full_name || fullName
                            }
                        }
                    } catch (apiErr) {
                    }
                }

                // Final Fallback - default to manager (NOT driver)
                if (!role) role = 'manager'
                if (!fullName) fullName = session?.user?.email?.split('@')[0] || 'User'

                if (isMountedRef.current) {
                    setUserId(currentUserId)
                    setUserRole(role)
                    setUserName(fullName || 'User')
                }

                // Initialize push notifications for all roles (managers, dispatchers, drivers)
                PushService.init()

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
                        } catch { }
                    }

                    if (companyId) {
                        companyIdRef.current = companyId
                        // Fetch orders, drivers, hubs IN PARALLEL for speed
                        const [ordersResult, driversResult, hubsResult] = await Promise.allSettled([
                            supabase
                                .from('orders')
                                .select('*')
                                .eq('company_id', companyId)
                                .order('created_at', { ascending: false })
                                .limit(500),
                            supabase
                                .from('drivers')
                                .select('*')
                                .eq('company_id', companyId),
                            supabase
                                .from('hubs')
                                .select('id')
                                .eq('company_id', companyId),
                        ])

                        // Process orders
                        if (ordersResult.status === 'fulfilled') {
                            const { data: ordersData, error: ordersError } = ordersResult.value
                            if (ordersData && !ordersError) {
                                setOrders(ordersData)
                                setStats({
                                    total: ordersData.length,
                                    pending: ordersData.filter(o => o.status === 'pending').length,
                                    assigned: ordersData.filter(o => o.status === 'assigned').length,
                                    inProgress: ordersData.filter(o => o.status === 'in_progress').length,
                                    delivered: ordersData.filter(o => o.status === 'delivered').length,
                                    cancelled: ordersData.filter(o => o.status === 'cancelled').length
                                })
                            }
                        }

                        // Process drivers
                        if (driversResult.status === 'fulfilled') {
                            const { data: driversData } = driversResult.value
                            if (driversData) {
                                setTotalDriversCount(driversData.length)
                                const dMap: Record<string, any> = {}
                                driversData.forEach(d => {
                                    dMap[d.id] = { name: d.name, vehicle_type: d.vehicle_type, vehicle: d.vehicle_type }
                                })
                                setDriversMap(dMap)
                            }
                        }

                        // Process hubs
                        if (hubsResult.status === 'fulfilled') {
                            const { data: hubsData } = hubsResult.value
                            if (hubsData) {
                                setHasHubs(hubsData.length > 0)
                            }
                        }
                    }
                }

                if (isMountedRef.current) {
                    setIsLoading(false)
                    isInitDone = true
                    clearTimeout(maxWaitGlobal)
                }
            } catch (error) {
                console.error('Dashboard Init Error:', error)
                if (isMountedRef.current) {
                    setIsLoading(false)
                    isInitDone = true
                    clearTimeout(maxWaitGlobal)
                }
            }
        }

        initDashboard()

        return () => {
            isMountedRef.current = false
            clearTimeout(maxWaitGlobal)
        }
    }, [])

    // Reusable refresh function for both focus + pull-to-refresh
    const refreshDashboard = async () => {
        const companyId = companyIdRef.current
        if (!companyId) return

        try {
            const [ordersResult, driversResult, hubsResult] = await Promise.allSettled([
                supabase.from('orders').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500),
                supabase.from('drivers').select('*').eq('company_id', companyId),
                supabase.from('hubs').select('id').eq('company_id', companyId),
            ])

            if (ordersResult.status === 'fulfilled' && ordersResult.value.data) {
                const ordersData = ordersResult.value.data
                setOrders(ordersData)
                setStats({
                    total: ordersData.length,
                    pending: ordersData.filter(o => o.status === 'pending').length,
                    assigned: ordersData.filter(o => o.status === 'assigned').length,
                    inProgress: ordersData.filter(o => o.status === 'in_progress').length,
                    delivered: ordersData.filter(o => o.status === 'delivered').length,
                    cancelled: ordersData.filter(o => o.status === 'cancelled').length
                })
            }

            if (driversResult.status === 'fulfilled' && driversResult.value.data) {
                const driversData = driversResult.value.data
                setTotalDriversCount(driversData.length)
                const dMap: Record<string, any> = {}
                driversData.forEach(d => {
                    dMap[d.id] = { name: d.name, vehicle_type: d.vehicle_type, vehicle: d.vehicle_type }
                })
                setDriversMap(dMap)
            }

            if (hubsResult.status === 'fulfilled' && hubsResult.value.data) {
                setHasHubs(hubsResult.value.data.length > 0)
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
                        description: `Order #${newOrder.order_number || newOrder.id?.slice(0, 8)} was delivered ${newOrder.delivery_distance_meters ? Math.round(newOrder.delivery_distance_meters * 3.281) + ' ft' : 'far'} from destination`,
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
            <div className="p-4 pt-12 pb-32 space-y-6 max-w-7xl mx-auto min-h-screen bg-slate-50/50 dark:bg-slate-950 transition-colors">
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
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                                {isToday ? getGreeting() : "Report View"}, {userName.split(' ')[0]} <Sparkles className="h-6 w-6 text-amber-500 animate-pulse drop-shadow-sm" />
                            </h1>
                            <NotificationBell userId={userId} />
                        </div>
                        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
                            {isToday ? "Live Operations Overview" :
                                isRange ? `Period Report: ${format(dateRange?.from!, 'MMM d')} - ${format(dateRange?.to!, 'MMM d, yyyy')}` :
                                    `Historical Report for ${format(dateRange?.from || new Date(), 'MMM dd, yyyy')}`}
                            {isToday && <span className="flex h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse ring-4 ring-green-500/20" />}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full sm:w-[260px] justify-start text-left font-medium h-12 rounded-xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 shadow-sm hover:bg-white dark:hover:bg-slate-900 transition-all",
                                        !dateRange && "text-slate-500"
                                    )}
                                >
                                    <CalendarIcon className="mr-3 h-4 w-4 text-blue-500" />
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
                            <PopoverContent className="w-auto p-0 rounded-2xl border-slate-200/50 dark:border-slate-800/50 shadow-xl overflow-hidden" align="end">
                                <div className="p-3 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50">
                                    <h4 className="font-bold text-[10px] text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-widest px-1">Quick Select</h4>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" className="text-xs h-8 flex-1 bg-white dark:bg-slate-950 rounded-lg hover:border-blue-500/50" onClick={() => setDateRange({ from: new Date(), to: new Date() })}>Today</Button>
                                        <Button size="sm" variant="outline" className="text-xs h-8 flex-1 bg-white dark:bg-slate-950 rounded-lg hover:border-blue-500/50" onClick={() => setDateRange({ from: subDays(new Date(), 6), to: new Date() })}>7 Days</Button>
                                        <Button size="sm" variant="outline" className="text-xs h-8 flex-1 bg-white dark:bg-slate-950 rounded-lg hover:border-blue-500/50" onClick={() => setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })}>Month</Button>
                                    </div>
                                </div>
                                <Calendar
                                    mode="range"
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    disabled={(date) => date > new Date() || date < new Date("2024-01-01")}
                                    initialFocus
                                    className="bg-white/95 dark:bg-slate-950/95"
                                />
                                <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center">
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                        💡 Tip: Click start date, then click end date to select a range.
                                    </p>
                                </div>
                            </PopoverContent>
                        </Popover>

                        <div className="flex items-center gap-3">
                            <button onClick={() => router.push('/orders')} className="hidden sm:flex flex-1 sm:flex-none items-center justify-center rounded-xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 px-5 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-white dark:hover:bg-slate-800 transition-all h-12 gap-2 active:scale-95">
                                <Package className="h-4 w-4 text-blue-500" />
                                <span className="hidden sm:inline">Orders</span>
                            </button>
                            <button onClick={() => router.push('/planner')} className="flex-1 md:flex-none inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-white px-6 py-2 text-sm font-bold text-white dark:text-slate-900 shadow-lg shadow-slate-900/25 hover:shadow-slate-900/40 hover:-translate-y-0.5 transition-all h-12 gap-2 active:scale-95 whitespace-nowrap">
                                <MapPin className="h-4 w-4 text-white/90 dark:text-slate-900/90" /> Route Planner
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. ALERT BANNER */}
                {stats.pending > 0 && isToday && (
                    <div onClick={() => router.push('/planner')} className="relative overflow-hidden bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/20 border border-amber-200/60 dark:border-amber-900/50 rounded-2xl p-4 sm:p-5 flex items-center justify-between cursor-pointer group shadow-sm hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-both">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="h-12 w-12 bg-white dark:bg-amber-900/80 text-amber-500 dark:text-amber-400 rounded-xl flex items-center justify-center shadow-sm border border-amber-100 dark:border-amber-800/50 shrink-0">
                                <AlertCircle size={24} className="animate-pulse" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-amber-900 dark:text-amber-100 text-base sm:text-lg tracking-tight">Action Required: {stats.pending} New Orders</h3>
                                <p className="text-amber-700/80 dark:text-amber-300/80 text-xs sm:text-sm font-medium mt-0.5">Assign these orders to drivers to begin delivery.</p>
                            </div>
                        </div>
                        <div className="h-10 w-10 flex items-center justify-center bg-amber-100/50 dark:bg-amber-900/30 rounded-full group-hover:bg-amber-200/50 dark:group-hover:bg-amber-900/50 transition-colors shrink-0 relative z-10">
                            <ArrowRight className="text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform" size={20} />
                        </div>
                    </div>
                )}

                {/* 2b. SUSPICIOUS DELIVERY ALERT */}
                {(() => {
                    const suspiciousCount = orders.filter((o: any) => o.was_out_of_range && o.status === 'delivered').length
                    return suspiciousCount > 0 ? (
                        <div className="relative overflow-hidden bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/20 border border-red-200/60 dark:border-red-900/50 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-sm">
                            <div className="absolute top-0 left-0 w-32 h-32 bg-red-500/10 dark:bg-red-500/5 rounded-full blur-2xl -ml-16 -mt-16 pointer-events-none" />
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="h-12 w-12 bg-white dark:bg-red-900/80 text-red-500 dark:text-red-400 rounded-xl flex items-center justify-center shadow-sm border border-red-100 dark:border-red-800/50 shrink-0">
                                    <AlertTriangle size={24} />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-red-900 dark:text-red-100 text-base sm:text-lg tracking-tight">{suspiciousCount} Suspicious Deliver{suspiciousCount === 1 ? 'y' : 'ies'}</h3>
                                    <p className="text-red-700/80 dark:text-red-300/80 text-xs sm:text-sm font-medium mt-0.5">Orders delivered outside the expected zone (&gt;500m away)</p>
                                </div>
                            </div>
                        </div>
                    ) : null
                })()}

                {/* 3. METRICS GRID */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-both">
                    <StatsCard title="Total Volume" value={stats.total} icon={Package} color="text-slate-600 dark:text-slate-400" bg="bg-slate-100 dark:bg-slate-800" />
                    <StatsCard title="In Progress" value={stats.inProgress + stats.assigned} icon={Truck} color="text-blue-600 dark:text-blue-400" bg="bg-blue-100 dark:bg-blue-900/30" />
                    <StatsCard title="Completed" value={stats.delivered} icon={CheckCircle2} color="text-green-600 dark:text-green-400" bg="bg-green-100 dark:bg-green-900/30" />
                    <StatsCard title="Issues/Cancel" value={stats.cancelled} icon={AlertCircle} color="text-red-600 dark:text-red-400" bg="bg-red-100 dark:bg-red-900/30" />
                </div>

                {/* 4. MAIN CONTENT AREA */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 fill-mode-both">

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
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex items-center gap-4 hover:border-blue-300 dark:hover:border-blue-700/50 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden">
                {/* Decorative background gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-50/30 to-transparent dark:via-blue-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                {/* Hover Indicator */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                    <MapPin size={10} /> Track Live
                </div>

                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center text-2xl shrink-0 group-hover:from-blue-50 group-hover:to-blue-100 dark:group-hover:from-blue-900/40 dark:group-hover:to-blue-800/40 transition-colors shadow-inner border border-white/50 dark:border-white/5">
                    {driver.vehicle === 'Truck' ? <Truck className="h-6 w-6 text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" /> :
                        driver.vehicle === 'Van' ? <Package className="h-6 w-6 text-slate-600 dark:text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" /> :
                            <User className="h-6 w-6 text-slate-600 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />}
                </div>
                <div className="flex-1 relative z-10">
                    <div className="flex justify-between mb-2">
                        <h3 className="font-extrabold text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors text-base">{driver.name}</h3>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full shadow-inner">{driver.completed}/{driver.total} Stops</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-3 w-full bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-inner">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 relative overflow-hidden ${percentage === 100 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-blue-600 to-indigo-500'}`}
                            style={{ width: `${percentage}%` }}
                        >
                            <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite] -skew-x-12 translate-x-[-100%]" />
                        </div>
                    </div>
                </div>
                <div className="text-center min-w-[3.5rem] relative z-10">
                    <span className={`text-sm sm:text-base font-black tracking-tight ${percentage === 100 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                        {percentage}%
                    </span>
                </div>
            </div>
        </Link>
    )
}

function StatsCard({ title, value, icon: Icon, color, bg }: any) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-[20px] border border-slate-100 dark:border-slate-800 p-6 flex flex-col h-[168px] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">

            <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-[800] text-[#8694A6] dark:text-slate-400 uppercase tracking-widest break-words max-w-[60%] leading-[1.4] whitespace-pre-line">{title.includes(' ') && title !== 'IN PROGRESS' ? title.replace(' ', '\n') : title}</p>

                <div className={`h-[52px] w-[52px] rounded-[16px] flex items-center justify-center shrink-0 ${bg} ${color}`}>
                    <Icon size={24} strokeWidth={2.5} />
                </div>
            </div>

            <div className="mt-auto">
                <p className="text-[48px] font-[900] text-[#0f172a] dark:text-white leading-none tracking-tighter">{value}</p>
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
