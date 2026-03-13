"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Package, Truck, CheckCircle2, Clock, MapPin, ArrowRight, AlertCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, Timer, HelpCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { format, isSameDay, subDays, startOfDay, endOfDay, eachDayOfInterval, differenceInDays, startOfMonth, endOfMonth } from "date-fns"
import { DateRange } from "react-day-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
// Recharts
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

import { PushService } from '@/lib/push-service'
import { offlineManager } from '@/lib/offline-manager' // Auto-inits
import { DriverSetupGuide } from '@/components/driver-setup-guide'
import { useToast } from '@/components/toast-provider'
import { Power } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'

export function DriverDashboardView({ userId }: { userId: string }) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(true)
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() })
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        in_progress: 0,
        delivered: 0,
        cancelled: 0
    })
    const [onTimeRate, setOnTimeRate] = useState(100)
    const [weeklyData, setWeeklyData] = useState<any[]>([])
    const [ordersList, setOrdersList] = useState<any[]>([])
    const [isOnline, setIsOnline] = useState(false)
    const [driverId, setDriverId] = useState<string | null>(null)
    const { toast } = useToast()
    const [forceShowGuide, setForceShowGuide] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const chartRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // ResizeObserver to detect when container has width (Fixes Recharts width(-1) error)
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0) {
                    setIsMounted(true)
                }
            }
        })

        if (chartRef.current) {
            resizeObserver.observe(chartRef.current)
        }

        // 2. Fallback: Force mount after delay if observer doesn't fire (Safety net)
        setTimeout(() => {
            setIsMounted(true)
        }, 500)

        // Initialize Background Services
        PushService.init()

        return () => {
            resizeObserver.disconnect()
        }
    }, [])

    useEffect(() => {
        if (!userId || userId === '') {
            setIsLoading(false)
            return
        }
        fetchDriverStats()
    }, [userId, dateRange])

    async function fetchDriverStats() {
        setIsLoading(true)
        try {
            // Get Driver ID linked to this User ID
            const { data: driverData } = await supabase
                .from('drivers')
                .select('id, name, is_online, last_location_update')
                .eq('user_id', userId)
                .single()


            if (!driverData) {
                setIsLoading(false)
                return
            }

            setDriverId(driverData.id)

            // Use isDriverOnline() as source of truth (checks is_online + last_location_update freshness)
            const { isDriverOnline } = await import('@/lib/driver-status')
            const actualOnline = isDriverOnline(driverData)
            setIsOnline(actualOnline)
            if (typeof window !== 'undefined') {
                localStorage.setItem('driver_online_status', String(actualOnline))
            }

            const startStr = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
            const endStr = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : startStr
            const isToday = dateRange?.from && isSameDay(dateRange.from, new Date()) && (!dateRange.to || isSameDay(dateRange.to, new Date()))
            const isSingleDay = startStr === endStr

            // 1. FETCH ORDERS (Range)
            let query = supabase
                .from('orders')
                .select('*')
                .eq('driver_id', driverData.id)
                .order('priority', { ascending: false })

            // Apply Date Range Filter
            if (isSingleDay && isToday) {
                // TODAY: Show today's orders + overdue orders (strict filter for performance)
                // Get orders from 7 days ago to catch overdue items, but not entire history
                const lookbackDate = format(subDays(new Date(), 7), 'yyyy-MM-dd')
                query = query.gte('delivery_date', lookbackDate)
            } else {
                // HISTORY or RANGE: Strict Date Filter
                // Use gte/lte even for single day to ensure consistent behavior with charts
                query = query.gte('delivery_date', startStr).lte('delivery_date', endStr)
            }

            const { data: orders } = await query

            if (orders) {
                let relevantOrders = orders
                if (isToday && isSingleDay) {
                    // TODAY VIEW logic: Show today + overdue
                    relevantOrders = orders.filter(o => {
                        const orderDate = o.delivery_date
                        // Today's orders
                        if (orderDate === startStr) return true
                        // Overdue: past orders that are not completed
                        if (orderDate < startStr && o.status !== 'delivered' && o.status !== 'cancelled') return true
                        return false
                    })
                }
                setOrdersList(relevantOrders)

                const dailyDelivered = relevantOrders.filter(o => o.status === 'delivered').length

                setStats({
                    total: relevantOrders.length,
                    pending: relevantOrders.filter(o => o.status === 'assigned' || o.status === 'pending').length,
                    in_progress: relevantOrders.filter(o => o.status === 'in_progress').length,
                    delivered: dailyDelivered,
                    cancelled: relevantOrders.filter(o => o.status === 'cancelled').length
                })
            }

            // 2. CHART DATA (For Range)
            const { data: historyOrders } = await supabase
                .from('orders')
                .select('status, delivery_date, delivered_at')
                .eq('driver_id', driverData.id)
                .gte('delivery_date', startStr)
                .lte('delivery_date', endStr)

            if (historyOrders) {
                const chartMap: Record<string, { date: string, completed: number, failed: number }> = {}

                // If range > 0 days, iterate days. If single day, maybe show previous 6 days context?
                // User asked for "Total ... select date range". If they select a range, chart should show that range.
                // If they select today (single), showing weekly context (previous behavior) is nice.

                let chartStart = startStr
                let chartEnd = endStr

                if (isSingleDay) {
                    // Keep looking back 7 days for context if single day
                    chartStart = format(subDays(new Date(startStr), 6), 'yyyy-MM-dd')
                }

                const days = eachDayOfInterval({ start: new Date(chartStart), end: new Date(chartEnd) })

                days.forEach(d => {
                    const dStr = format(d, 'yyyy-MM-dd')
                    chartMap[dStr] = { date: format(d, 'EEE dd'), completed: 0, failed: 0 }
                })

                // Reuse the previously fetched history logic but adapted
                // If we are in single day mode, we need to fetch history specifically for chart because `orders` above might be just for that day
                // The query above (historyOrders) uses current range. 
                // IF isSingleDay, we need to fetch the 7-day lookback explicitly.

                let chartOrders = historyOrders

                if (isSingleDay) {
                    const { data: lookback } = await supabase
                        .from('orders')
                        .select('status, delivery_date, delivered_at')
                        .eq('driver_id', driverData.id)
                        .gte('delivery_date', chartStart)
                        .lte('delivery_date', chartEnd)
                    chartOrders = lookback || []
                }

                let onTimeCount = 0
                let totalDeliveredHistory = 0

                chartOrders.forEach(o => {
                    const d = o.delivery_date
                    if (chartMap[d]) {
                        if (o.status === 'delivered') {
                            chartMap[d].completed++
                            totalDeliveredHistory++
                            if (o.delivered_at && o.delivered_at.startsWith(d)) {
                                onTimeCount++
                            }
                        } else if (o.status === 'cancelled') {
                            chartMap[d].failed++
                        }
                    }
                })

                setWeeklyData(Object.values(chartMap))

                if (totalDeliveredHistory > 0) {
                    setOnTimeRate(Math.round((onTimeCount / totalDeliveredHistory) * 100))
                } else {
                    setOnTimeRate(0)
                }
            }

        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const [isTogglingStatus, setIsTogglingStatus] = useState(false)

    async function toggleOnlineStatus() {
        if (!driverId || isTogglingStatus) return
        setIsTogglingStatus(true)

        const newStatus = !isOnline

        try {
            // Update DB first — also set last_location_update so isDriverOnline() works immediately
            const updatePayload: Record<string, any> = { is_online: newStatus }
            if (newStatus) {
                updatePayload.last_location_update = new Date().toISOString()
            }
            const { error } = await supabase.from('drivers').update(updatePayload).eq('id', driverId)
            if (error) throw error

            // Only update UI after DB succeeds
            setIsOnline(newStatus)
            if (typeof window !== 'undefined') {
                localStorage.setItem('driver_online_status', String(newStatus))
            }

            // Log Activity (non-blocking)
            Promise.resolve(supabase.from('driver_activity_logs').insert({
                driver_id: driverId,
                status: newStatus ? 'online' : 'offline',
                timestamp: new Date().toISOString()
            })).catch(() => {})

            toast({ title: newStatus ? "You are ONLINE 🟢" : "You are OFFLINE ⚫", type: "success" })
        } catch (error: any) {
            console.error('Toggle status failed:', error)
            toast({
                title: "Failed to update status",
                description: error?.message || "Database permission denied",
                type: "error"
            })
        } finally {
            setIsTogglingStatus(false)
        }
    }

    if (isLoading) return <DriverDashboardSkeleton />

    const completionPercentage = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0
    const isToday = dateRange?.from && isSameDay(dateRange.from, new Date()) && (!dateRange.to || isSameDay(dateRange.to, new Date()))
    const isRange = dateRange?.from && dateRange.to && !isSameDay(dateRange.from, dateRange.to)

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32 pt-12 p-4 space-y-6 overflow-x-hidden">
            {/* Header with Date Picker */}
            <div className="flex items-center justify-between mb-8 animate-in fade-in slide-in-from-top-2 duration-500">
                <div>
                    <h1 className="text-[28px] font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none mb-1">
                        {isToday ? "Today" : isRange ? "Period Reports" : "History Log"}
                    </h1>
                    <p className="text-[15px] text-slate-500 dark:text-slate-400 font-medium">
                        {isRange && dateRange?.from && dateRange?.to && !isSameDay(dateRange.from, dateRange.to)
                            ? `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                            : isToday ? "Let's get moving!" : dateRange?.from ? format(dateRange.from, 'EEEE, MMM d, yyyy') : ''}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "flex-shrink-0 h-10 rounded-full border-slate-200 dark:border-slate-800 bg-white dark:bg-[#18181B] shadow-sm px-4 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all",
                                    !dateRange && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                                {dateRange?.from ? (
                                    dateRange.to && !isSameDay(dateRange.from, dateRange.to) ? (
                                        <>
                                            {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yy")}
                                        </>
                                    ) : (
                                        isSameDay(dateRange.from, new Date()) ? "Today" : format(dateRange.from, "MMM d, yyyy")
                                    )
                                ) : (
                                    <span>Date</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl" align="end">
                            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#18181B]">
                                <h4 className="font-bold text-xs text-slate-500 mb-2 uppercase tracking-wider">Quick Select</h4>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1 bg-white dark:bg-slate-900 rounded-xl font-bold" onClick={() => setDateRange({ from: new Date(), to: new Date() })}>
                                        Today
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1 bg-white dark:bg-slate-900 rounded-xl font-bold" onClick={() => setDateRange({ from: subDays(new Date(), 6), to: new Date() })}>
                                        Last 7
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1 bg-white dark:bg-slate-900 rounded-xl font-bold" onClick={() => setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) })}>
                                        This Month
                                    </Button>
                                </div>
                            </div>
                            <Calendar
                                mode="range"
                                selected={dateRange}
                                onSelect={setDateRange}
                                disabled={(date) => date > new Date() || date < new Date("2024-01-01")}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>

                    <div className="bg-white dark:bg-[#18181B] border border-slate-200 dark:border-slate-800 shadow-sm rounded-full h-10 w-10 flex items-center justify-center relative">
                        <NotificationBell userId={userId} />
                    </div>
                </div>
            </div>

            {/* STATUS TOGGLE & GUIDE (Only show for TODAY) */}
            {isToday && (
                <div className="flex items-center justify-between bg-white dark:bg-[#18181B] p-4 rounded-3xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100 dark:border-slate-800/60 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-150 fill-mode-both">
                    <div className="flex items-center gap-3.5">
                        <div className={cn(
                            "h-[46px] w-[46px] rounded-full flex items-center justify-center transition-colors border-2",
                            isOnline 
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20' 
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400'
                        )}>
                            <Power size={22} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-[16px] leading-tight">Status: {isOnline ? 'Online' : 'Offline'}</p>
                            <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">{isOnline ? 'You are receiving orders' : 'You are currently hidden'}</p>
                        </div>
                    </div>
                    <Button
                        variant={isOnline ? "default" : "outline"}
                        className={cn(
                            "rounded-[14px] font-bold h-[42px] px-5",
                            isOnline 
                                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/20" 
                                : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        )}
                        onClick={toggleOnlineStatus}
                        disabled={isTogglingStatus}
                    >
                        {isTogglingStatus ? 'Updating...' : isOnline ? 'Go Offline' : 'Go Online'}
                    </Button>
                </div>
            )}

            {/* Quick Setup Guide (Only show for TODAY) */}
            {isToday && (
                <DriverSetupGuide
                    isOnline={isOnline}
                    hasTasks={stats.pending > 0}
                    onToggleOnline={toggleOnlineStatus}
                    onViewAssignments={() => router.push('/orders')}
                    forceShow={forceShowGuide}
                    onDismiss={() => setForceShowGuide(false)}
                />
            )}

            {/* Main Progress Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden transition-all animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
                {/* Success Checkmark - Shows when 100% complete */}
                <div className={`absolute top-0 right-0 p-4 transition-opacity duration-500 ${completionPercentage === 100 && stats.total > 0
                    ? 'opacity-20 dark:opacity-10'
                    : 'opacity-5'
                    }`}>
                    <CheckCircle2 size={120} className={completionPercentage === 100 ? "text-green-500" : "dark:text-white"} />
                </div>

                <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-4">
                    {/* Circular Progress (CSS only) */}
                    <div className="relative h-32 w-32">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                            {/* Background Circle */}
                            <path
                                className="text-slate-100 dark:text-slate-800"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                            {/* Progress Circle */}
                            <path
                                className={`${completionPercentage === 100 ? 'text-green-500' : 'text-blue-600 dark:text-blue-500'} transition-all duration-1000 ease-out`}
                                strokeDasharray={`${completionPercentage}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{stats.delivered}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">of {stats.total} Done</span>
                        </div>
                    </div>

                    <div className="w-full">
                        {completionPercentage === 100 && stats.total > 0 ? (
                            <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 py-2 px-4 rounded-full text-sm font-bold">
                                {isToday ? "🎉 All Done! Great Job!" : "✅ Completed fully"}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {isToday ? `${stats.total - stats.delivered} stops remaining` : `${stats.delivered} stops completed`}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50 flex flex-col items-center justify-center text-center">
                    <Timer className="text-blue-600 dark:text-blue-400 mb-2" size={24} />
                    <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">{onTimeRate}%</span>
                    <span className="text-xs text-blue-600 dark:text-blue-300 font-medium uppercase">On-Time Rate</span>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-100 dark:border-orange-900/50 flex flex-col items-center justify-center text-center">
                    <MapPin className="text-orange-600 dark:text-orange-400 mb-2" size={24} />
                    <span className="text-2xl font-bold text-orange-900 dark:text-orange-100">{stats.total - stats.delivered - stats.cancelled}</span>
                    <span className="text-xs text-orange-600 dark:text-orange-300 font-medium uppercase">Stops Remaining</span>
                </div>
            </div>

            {/* Weekly Performance Chart */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="text-slate-400" size={18} />
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Weekly Performance</h3>
                </div>
                <div ref={chartRef} className="w-full h-64 min-w-full" style={{ minHeight: '250px' }}>
                    {isMounted ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                            <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                />
                                <Tooltip
                                    cursor={{ fill: '#f1f5f9' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="completed" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20}>
                                    {weeklyData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.completed >= 10 ? '#22c55e' : '#3b82f6'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full w-full flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                            <Skeleton className="h-full w-full rounded-xl opacity-20" />
                        </div>
                    )}
                </div>
            </div>

            {/* Action Button (Show only Current Day) */}
            {
                isToday && (
                    <Button
                        size="lg"
                        className="w-full h-14 text-lg shadow-lg shadow-blue-200 dark:shadow-blue-900/50 rounded-xl"
                        onClick={() => router.push('/orders')}
                    >
                        Start Delivering <ArrowRight className="ml-2" />
                    </Button>
                )
            }

            {/* Orders List */}
            <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-3">{isToday ? "Active Orders" : "Orders Log"}</h3>
                {ordersList.length === 0 ? (
                    <div className="text-center p-8 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
                        {isToday ? "No active orders found." : "No delivery history for this day."}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {ordersList.map(order => {
                            // Check if order is overdue (past date + not delivered)
                            const isOverdue = isToday && order.delivery_date < format(new Date(), 'yyyy-MM-dd') && order.status !== 'delivered'

                            return (
                                <div
                                    key={order.id}
                                    onClick={() => router.push(`/my-editor?id=${order.id}`)}
                                    className={cn(
                                        "bg-white dark:bg-[#18181B] p-4 rounded-2xl border shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between cursor-pointer transition-all active:scale-[0.98]",
                                        isOverdue 
                                            ? "border-orange-200 dark:border-orange-500/30 shadow-[0_4px_12px_rgba(249,115,22,0.05)] dark:shadow-none" 
                                            : "border-slate-100 dark:border-slate-800/60 hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
                                    )}
                                >
                                    <div className="flex items-center gap-3 w-full">
                                        {/* Status Dot */}
                                        <div className={cn(
                                            "w-2 h-2 rounded-full shrink-0",
                                            order.status === 'delivered' ? "bg-emerald-500" :
                                            order.status === 'cancelled' ? "bg-red-500" :
                                            isOverdue ? "bg-orange-500" : "bg-blue-500"
                                        )} />
                                        
                                        <div className="flex-1 min-w-0 pr-2">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="font-bold text-[15px] text-slate-900 dark:text-slate-100 truncate">
                                                    {order.customer_name}
                                                </p>
                                                {isOverdue && (
                                                    <span className="shrink-0 text-[10px] bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                                        Overdue
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[13px] text-slate-500 dark:text-slate-400 truncate">
                                                {order.address?.split(',')[0]}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end shrink-0 pl-2">
                                        <span className={cn(
                                            "text-[12px] px-3 py-1 rounded-full font-bold",
                                            order.status === 'delivered' ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
                                            order.status === 'cancelled' ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" :
                                            "bg-blue-50/80 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                                        )}>
                                            {order.status === 'delivered' ? 'Done' :
                                             order.status === 'cancelled' ? 'Failed' : 'Active'}
                                        </span>
                                        
                                        {/* Timestamp Display */}
                                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium flex items-center justify-end gap-1">
                                            {order.status === 'delivered' && order.delivered_at ? (
                                                <>
                                                    <CheckCircle2 size={12} className="text-emerald-500" />
                                                    {format(new Date(order.delivered_at), 'h:mm a')}
                                                </>
                                            ) : (order.time_window_start || order.time_window_end) ? (
                                                <>
                                                    <Clock size={12} />
                                                    {order.time_window_start?.slice(0, 5)} - {order.time_window_end?.slice(0, 5)}
                                                </>
                                            ) : null}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div >
    )
}

function DriverDashboardSkeleton() {
    return (
        <div className="p-4 space-y-6">
            <div className="flex justify-between">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-10 rounded-full" />
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
            <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
            </div>
            <Skeleton className="h-14 w-full rounded-xl" />
        </div>
    )
}
