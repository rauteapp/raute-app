"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Package, Truck, CheckCircle2, Clock, MapPin, ArrowRight, AlertCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, Timer, HelpCircle, Activity, Sparkles, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { format, isSameDay, subDays, startOfDay, endOfDay, eachDayOfInterval, differenceInDays, startOfMonth, endOfMonth } from "date-fns"
import { DateRange } from "react-day-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence, Variants } from "framer-motion"
// Recharts
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

import { PushService } from '@/lib/push-service'
import { offlineManager } from '@/lib/offline-manager'
import { DriverSetupGuide } from '@/components/driver-setup-guide'
import { useToast } from '@/components/toast-provider'
import { Power } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'
// Animation variants
const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
}

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
}

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
    const [isOnline, setIsOnline] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('driver_online_status')
            return saved === 'true'
        }
        return false
    })
    const [driverId, setDriverId] = useState<string | null>(null)
    const [driverName, setDriverName] = useState("")
    const { toast } = useToast()
    const [forceShowGuide, setForceShowGuide] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const chartRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
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

        setTimeout(() => {
            setIsMounted(true)
        }, 500)

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
            setDriverName(driverData.name || "")

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

            let query = supabase
                .from('orders')
                .select('*')
                .eq('driver_id', driverData.id)
                .order('priority', { ascending: false })

            if (isSingleDay && isToday) {
                const lookbackDate = format(subDays(new Date(), 7), 'yyyy-MM-dd')
                query = query.gte('delivery_date', lookbackDate)
            } else {
                query = query.gte('delivery_date', startStr).lte('delivery_date', endStr)
            }

            const { data: orders } = await query

            if (orders) {
                let relevantOrders = orders
                if (isToday && isSingleDay) {
                    relevantOrders = orders.filter(o => {
                        const orderDate = o.delivery_date
                        if (orderDate === startStr) return true
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

            const { data: historyOrders } = await supabase
                .from('orders')
                .select('status, delivery_date, delivered_at')
                .eq('driver_id', driverData.id)
                .gte('delivery_date', startStr)
                .lte('delivery_date', endStr)

            if (historyOrders) {
                const chartMap: Record<string, { date: string, completed: number, failed: number }> = {}

                let chartStart = startStr
                let chartEnd = endStr

                if (isSingleDay) {
                    chartStart = format(subDays(new Date(startStr), 6), 'yyyy-MM-dd')
                }

                const days = eachDayOfInterval({ start: new Date(chartStart), end: new Date(chartEnd) })

                days.forEach(d => {
                    const dStr = format(d, 'yyyy-MM-dd')
                    chartMap[dStr] = { date: format(d, 'EEE dd'), completed: 0, failed: 0 }
                })

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
            const updatePayload: Record<string, any> = { is_online: newStatus }
            if (newStatus) {
                updatePayload.last_location_update = new Date().toISOString()
            }
            const { error } = await supabase.from('drivers').update(updatePayload).eq('id', driverId)
            if (error) throw error

            setIsOnline(newStatus)
            if (typeof window !== 'undefined') {
                localStorage.setItem('driver_online_status', String(newStatus))
            }

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
        <motion.div 
            initial="hidden" 
            animate="show" 
            variants={containerVariants}
            className="min-h-screen bg-slate-50/50 dark:bg-slate-950 pb-32 pt-12 p-5 space-y-6 overflow-x-hidden selection:bg-blue-200"
        >
            {/* Header with Date Picker */}
            <motion.div variants={itemVariants} className="flex items-start justify-between gap-3 pt-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 truncate tracking-tight">
                            {isToday ? "Today's Route" : isRange ? "Period Reports" : "History Log"} 
                        </h1>
                        <NotificationBell userId={userId} />
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                        {isRange
                            ? `${dateRange?.from ? format(dateRange.from, 'MMM d') : ''} - ${dateRange?.to ? format(dateRange.to, 'MMM d, yyyy') : ''}`
                            : isToday ? "Let&apos;s hit the road 🚚" : dateRange?.from ? format(dateRange.from, 'EEEE, MMM d, yyyy') : ''}
                    </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "flex-shrink-0 justify-start text-left font-medium text-xs rounded-full border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 hover:bg-slate-50 transition-all active:scale-95",
                                    !dateRange && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <span className="hidden sm:inline">
                                            {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                                        </span>
                                    ) : (
                                        <span>{format(dateRange.from, "MMM d")}</span>
                                    )
                                ) : (
                                    <span>Select Date</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-2xl border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden" align="end">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/50">
                                <h4 className="font-bold text-xs text-slate-500 mb-2 uppercase tracking-wider">Quick Select</h4>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1 rounded-lg" onClick={() => setDateRange({ from: new Date(), to: new Date() })}>
                                        Today
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-xs h-8 flex-1 rounded-lg" onClick={() => setDateRange({ from: subDays(new Date(), 6), to: new Date() })}>
                                        7 Days
                                    </Button>
                                </div>
                            </div>
                            <Calendar
                                mode="range"
                                selected={dateRange}
                                onSelect={setDateRange}
                                disabled={(date) => date > new Date() || date < new Date("2024-01-01")}
                                initialFocus
                                className="p-3"
                            />
                        </PopoverContent>
                    </Popover>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                        onClick={() => setForceShowGuide(!forceShowGuide)}
                    >
                        <HelpCircle size={16} />
                    </Button>
                </div>
            </motion.div>

            {/* Welcome Banner */}
            {isToday && driverName && (
                <motion.div variants={itemVariants} className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-indigo-500 via-blue-600 to-indigo-600 p-6 shadow-[0_8px_30px_rgb(59,130,246,0.3)] dark:shadow-[0_8px_30px_rgb(59,130,246,0.15)] border border-white/10">
                    {/* Animated background effects */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-24 -mt-24 pointer-events-none animate-[pulse_4s_ease-in-out_infinite]" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/20 rounded-full blur-2xl -ml-16 -mb-16 pointer-events-none" />
                    
                    <div className="relative z-10 flex items-center justify-between gap-4">
                        <div>
                            <motion.h2 
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2, type: "spring" }}
                                className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2 mb-1.5 tracking-tight"
                            >
                                Welcome, {driverName.split(' ')[0]}! <Sparkles className="text-amber-300 animate-[spin_4s_linear_infinite]" size={24} />
                            </motion.h2>
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                className="text-blue-100/90 font-medium text-sm sm:text-base max-w-[280px]"
                            >
                                Let&apos;s hit the road and deliver some smiles today! 🚚💨
                            </motion.p>
                        </div>
                        <motion.div 
                            initial={{ scale: 0, rotate: -45 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.3, type: "spring", bounce: 0.5 }}
                            className="hidden sm:flex h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/20 items-center justify-center shrink-0 shadow-inner"
                        >
                            <Truck className="text-white animate-[bounce_3s_ease-in-out_infinite]" size={32} />
                        </motion.div>
                    </div>
                </motion.div>
            )}

            {/* STATUS TOGGLE */}
            {isToday && (
                <motion.div variants={itemVariants} className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl blur-xl transition-opacity duration-500" style={{ opacity: isOnline ? 1 : 0 }} />
                    <button
                        onClick={toggleOnlineStatus}
                        disabled={isTogglingStatus}
                        className={cn(
                            "relative w-full overflow-hidden p-[2px] rounded-3xl transition-all duration-300 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-blue-500/20",
                            isOnline 
                                ? "bg-gradient-to-r from-green-400 via-emerald-500 to-green-600 shadow-[0_8px_30px_rgb(34,197,94,0.3)] dark:shadow-[0_8px_30px_rgb(34,197,94,0.2)]" 
                                : "bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-700 shadow-sm"
                        )}
                    >
                        <div className={cn(
                            "relative flex items-center justify-between px-6 py-4 rounded-[22px] transition-colors duration-300",
                            isOnline 
                                ? "bg-white/10 dark:bg-black/10 backdrop-blur-md" 
                                : "bg-white dark:bg-slate-900"
                        )}>
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "p-3 rounded-2xl flex items-center justify-center transition-all duration-300",
                                    isOnline 
                                        ? "bg-white text-green-600 shadow-sm scale-110" 
                                        : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                )}>
                                    <Power size={22} className={cn(isOnline && "animate-[pulse_2s_ease-in-out_infinite]")} />
                                </div>
                                <div className="text-left">
                                    <p className={cn(
                                        "font-bold text-lg tracking-tight transition-colors duration-300",
                                        isOnline ? "text-white" : "text-slate-900 dark:text-slate-100"
                                    )}>
                                        {isTogglingStatus ? 'Connecting...' : isOnline ? 'Online & Receiving' : 'Offline'}
                                    </p>
                                    <p className={cn(
                                        "text-sm font-medium transition-colors duration-300",
                                        isOnline ? "text-green-50" : "text-slate-500"
                                    )}>
                                        {isOnline ? 'Ready for new assignments' : 'Tap to start your shift'}
                                    </p>
                                </div>
                            </div>
                            
                            {/* Animated Pulse Indicator */}
                            <div className="relative flex h-3 w-3">
                                {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>}
                                <span className={cn(
                                    "relative inline-flex rounded-full h-3 w-3 transition-colors",
                                    isOnline ? "bg-white" : "bg-slate-300 dark:bg-slate-700"
                                )}></span>
                            </div>
                        </div>
                    </button>
                </motion.div>
            )}

            {/* Quick Setup Guide */}
            {isToday && (
                <motion.div variants={itemVariants}>
                    <DriverSetupGuide
                        isOnline={isOnline}
                        hasTasks={stats.pending > 0}
                        onToggleOnline={toggleOnlineStatus}
                        onViewAssignments={() => router.push('/orders')}
                        forceShow={forceShowGuide}
                        onDismiss={() => setForceShowGuide(false)}
                    />
                </motion.div>
            )}

            {/* Main Progress Card */}
            <motion.div variants={itemVariants} className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200/60 dark:border-slate-800 transition-all">
                {/* Background Decoration */}
                <div className="absolute -top-24 -right-24 h-64 w-64 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-full blur-3xl opacity-50 pointer-events-none" />
                
                <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-6">
                    {/* Modern Progress Ring */}
                    <div className="relative h-44 w-44">
                        <svg className="h-full w-full -rotate-90 drop-shadow-sm" viewBox="0 0 36 36">
                            {/* Background Track */}
                            <path
                                className="text-slate-100 dark:text-slate-800 transition-colors"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3.5"
                            />
                            {/* Progress Bar */}
                            <motion.path
                                initial={{ strokeDasharray: "0, 100" }}
                                animate={{ strokeDasharray: `${completionPercentage}, 100` }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className={cn(
                                    "transition-colors duration-500",
                                    completionPercentage === 100 ? "text-green-500" : "text-blue-600 dark:text-blue-500"
                                )}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="url(#progressGradient)"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                            />
                            <defs>
                                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor={completionPercentage === 100 ? "#22c55e" : "#3b82f6"} />
                                    <stop offset="100%" stopColor={completionPercentage === 100 ? "#16a34a" : "#6366f1"} />
                                </linearGradient>
                            </defs>
                        </svg>
                        
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                            {completionPercentage === 100 && stats.total > 0 ? (
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                                    <CheckCircle2 size={48} className="text-green-500 mb-1" />
                                </motion.div>
                            ) : (
                                <>
                                    <span className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">
                                        {stats.delivered}
                                    </span>
                                    <span className="text-sm text-slate-500 font-semibold tracking-wide uppercase mt-1">
                                        / {stats.total}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div>
                        {completionPercentage === 100 && stats.total > 0 ? (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 py-2.5 px-6 rounded-full text-sm font-bold shadow-sm">
                                <Sparkles size={16} />
                                {isToday ? "All done for today! Great job!" : "Completed fully"}
                            </motion.div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                                    {isToday ? `${stats.total - stats.delivered} stops remaining` : `${stats.delivered} stops completed`}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Keep up the great pace!</p>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Metrics Grid */}
            <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-3">
                        <Timer className="text-blue-600 dark:text-blue-400" size={20} />
                    </div>
                    <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-1">{onTimeRate}%</span>
                    <span className="text-xs text-slate-500 font-semibold tracking-wide uppercase">On-Time Rate</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-shadow">
                    <div className="h-10 w-10 rounded-full bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center mb-3">
                        <Activity className="text-orange-600 dark:text-orange-400" size={20} />
                    </div>
                    <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-1">{stats.total}</span>
                    <span className="text-xs text-slate-500 font-semibold tracking-wide uppercase">Total Assigned</span>
                </div>
            </motion.div>

            {/* Weekly Performance Chart */}
            <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 border-b-2 border-slate-900 dark:border-white pb-1">
                        <TrendingUp className="text-slate-900 dark:text-white" size={18} />
                        <h3 className="font-bold text-slate-900 dark:text-white text-base">Weekly Activity</h3>
                    </div>
                </div>
                <div ref={chartRef} className="w-full h-[220px] min-w-full">
                    {isMounted ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                                    dy={10}
                                />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc', opacity: 0.1 }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px 16px', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="completed" radius={[6, 6, 6, 6]} barSize={32}>
                                    {weeklyData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.completed >= 10 ? 'url(#barGradientGreen)' : 'url(#barGradientBlue)'} />
                                    ))}
                                </Bar>
                                <defs>
                                    <linearGradient id="barGradientBlue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#60a5fa" />
                                        <stop offset="100%" stopColor="#3b82f6" />
                                    </linearGradient>
                                    <linearGradient id="barGradientGreen" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#34d399" />
                                        <stop offset="100%" stopColor="#10b981" />
                                    </linearGradient>
                                </defs>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full w-full flex items-center justify-center">
                            <div className="flex gap-4 items-end h-[160px]">
                                {[40, 70, 45, 90, 65, 30, 80].map((h, i) => (
                                    <Skeleton key={i} className="w-8 rounded-md" style={{ height: `${h}%` }} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Action Button */}
            {isToday && (
                <motion.div variants={itemVariants}>
                    <Button
                        size="lg"
                        className="w-full h-16 text-lg font-bold shadow-[0_10px_40px_-10px_rgba(59,130,246,0.5)] dark:shadow-[0_10px_40px_-10px_rgba(59,130,246,0.3)] bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all active:scale-[0.98] group"
                        onClick={() => router.push('/orders')}
                    >
                        Start Delivering 
                        <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                </motion.div>
            )}

            {/* Orders List */}
            <motion.div variants={itemVariants} className="pt-4">
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">
                        {isToday ? "Current Queue" : "Orders Log"}
                    </h3>
                    <span className="text-sm font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                        {ordersList.length} items
                    </span>
                </div>
                
                {ordersList.length === 0 ? (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }} 
                        animate={{ opacity: 1, scale: 1 }} 
                        className="text-center p-12 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800"
                    >
                        <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Package className="text-slate-400" size={28} />
                        </div>
                        <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-1">No Orders Here</h4>
                        <p className="text-sm text-slate-500">
                            {isToday ? "You have no active orders queued for today." : "No delivery history for this selected date."}
                        </p>
                    </motion.div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence>
                            {ordersList.map((order, index) => {
                                const isOverdue = isToday && order.delivery_date < format(new Date(), 'yyyy-MM-dd') && order.status !== 'delivered'
                                
                                // Color variables based on status
                                const statusColors = {
                                    delivered: "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20",
                                    cancelled: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
                                    active: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
                                    overdue: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20"
                                }

                                const indicatorColors = {
                                    delivered: "bg-green-500 shadow-green-500/50",
                                    cancelled: "bg-red-500 shadow-red-500/50",
                                    active: "bg-blue-500 shadow-blue-500/50",
                                    overdue: "bg-orange-500 shadow-orange-500/50"
                                }

                                const currentStatus = order.status === 'delivered' ? 'delivered' : 
                                                      order.status === 'cancelled' ? 'cancelled' : 
                                                      isOverdue ? 'overdue' : 'active'

                                return (
                                    <motion.div
                                        key={order.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        onClick={() => router.push(`/my-editor?id=${order.id}`)}
                                        className={cn(
                                            "bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-sm cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 relative overflow-hidden group",
                                            isOverdue ? "border-orange-200 dark:border-orange-900/50" : "border-slate-100 dark:border-slate-800"
                                        )}
                                    >
                                        {/* Subtle hover gradient */}
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-50/50 to-transparent dark:via-white/[0.02] -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />

                                        <div className="flex items-start justify-between relative z-10 gap-3">
                                            <div className="flex items-start gap-3">
                                                {/* Status Indicator */}
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm mt-0.5",
                                                    statusColors[currentStatus]
                                                )}>
                                                    {currentStatus === 'delivered' ? <CheckCircle2 size={18} /> : 
                                                     currentStatus === 'cancelled' ? <X size={18} /> : 
                                                     <Package size={18} />}
                                                </div>
                                                
                                                <div className="min-w-0 pr-2">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <p className="font-bold text-base text-slate-900 dark:text-white truncate">
                                                            {order.customer_name}
                                                        </p>
                                                        {isOverdue && (
                                                            <span className="text-[10px] bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                                                Overdue
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1 font-medium">
                                                        {order.address?.split(',')[0]}
                                                    </p>
                                                    
                                                    {/* Timestamp showing directly under address for better flow */}
                                                    {((order.status === 'delivered' && order.delivered_at) || order.time_window_start) && (
                                                        <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400 font-medium">
                                                            {order.status === 'delivered' && order.delivered_at ? (
                                                                <>
                                                                    <CheckCircle2 size={12} className="text-green-500" />
                                                                    Delivered at {format(new Date(order.delivered_at), 'h:mm a')}
                                                                </>
                                                            ) : (order.time_window_start || order.time_window_end) ? (
                                                                <>
                                                                    <Clock size={12} className="text-blue-400" />
                                                                    Due {order.time_window_start?.slice(0, 5)} - {order.time_window_end?.slice(0, 5)}
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <ChevronRight className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors" size={20} />
                                                <div className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider", statusColors[currentStatus])}>
                                                    {currentStatus === 'delivered' ? 'Done' :
                                                     currentStatus === 'cancelled' ? 'Failed' : 'Queued'}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </motion.div>
            
            {/* Global shimmer animation definition */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes shimmer {
                    100% { transform: translateX(100%); }
                }
            `}} />
        </motion.div>
    )
}

function DriverDashboardSkeleton() {
    return (
        <div className="p-5 space-y-6 pt-12 min-h-screen bg-slate-50/50 dark:bg-slate-950">
            <div className="flex justify-between items-start">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-48 rounded-lg" />
                    <Skeleton className="h-4 w-32 rounded-lg" />
                </div>
                <Skeleton className="h-10 w-24 rounded-full" />
            </div>
            
            <Skeleton className="h-[280px] w-full rounded-3xl" />
            
            <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-32 rounded-3xl" />
                <Skeleton className="h-32 rounded-3xl" />
            </div>
            
            <Skeleton className="h-[220px] w-full rounded-3xl" />
            
            <div className="space-y-3 pt-4">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
        </div>
    )
}
