'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import "leaflet/dist/leaflet.css"
import { useRouter } from 'next/navigation'
import { supabase, type Order, type Driver } from '@/lib/supabase'
import { isDriverOnline } from '@/lib/driver-status'
import { waitForSession } from '@/lib/wait-for-session'
import type { OptimizationStrategy } from '@/lib/optimizer'
import { SplitSuggestionsModal } from '@/components/split-suggestions-modal'
import { calculateEvenSplit, type SplitSuggestion } from '@/lib/split-calculator'
import { WorkloadDashboard } from '@/components/WorkloadDashboard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Truck, Sparkles, AlertCircle, AlertTriangle, Lock, Unlock, Clock, ExternalLink, CheckCircle2, User as UserIcon, Edit } from 'lucide-react'
import Link from 'next/link'
import { useToast } from "@/components/toast-provider"
import { useTheme } from 'next-themes'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { smartGeocode } from '@/lib/smart-geocoder'
import { NotificationService } from '@/lib/notification-service'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { useMediaQuery } from '@/hooks/use-media-query'
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    useDraggable,
    useDroppable
} from '@dnd-kit/core'

/**
 * DYNAMIC MAP IMPORTS
 */
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false })
const MapResizer = dynamic(() => import('@/components/map/map-resizer'), { ssr: false })



// Helper to fix Leaflet icons in Next.js
// We'll run this in the component via useEffect to avoid top-level issues
const fixLeafletIcons = () => {
    if (typeof window !== 'undefined') {
        const L = require('leaflet')
        // Check if already fixed to avoid errors
        if ((L.Icon.Default.prototype as any)._getIconUrl) {
            delete (L.Icon.Default.prototype as any)._getIconUrl
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
                iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            })
        }
    }
}

/**
 * DRAGGABLE ORDER CARD COMPONENT
 */
function DraggableOrderCard({ order, isOverlay = false, onViewDetails }: { order: Order, isOverlay?: boolean, onViewDetails?: (o: Order) => void }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: isOverlay ? `overlay-${order.id}` : order.id,
        data: { order },
        disabled: isOverlay, // Overlay is visual only — don't register as draggable
    })

    const style: React.CSSProperties = isDragging
        ? { opacity: 0.4, willChange: 'transform', touchAction: 'none', zIndex: 9999 }
        : {} // TouchSensor uses delay-based activation — no touchAction needed when not dragging

    return (
        <Card
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onDoubleClick={() => onViewDetails?.(order)} // Quick View on Double Click
            className={`cursor-grab active:cursor-grabbing hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all duration-200 group rounded-[20px] shadow-sm hover:shadow-md ${isOverlay ? 'shadow-2xl scale-105 rotate-2 border-blue-500 ring-4 ring-blue-500/20' : ''} ${order.is_pinned ? 'border-l-4 border-l-rose-500' : ''} ${order.status === 'cancelled' ? 'bg-rose-50/80 dark:bg-rose-900/10 border-rose-200/60 dark:border-rose-900/40 opacity-80' : 'bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800'}`}
        >
            <CardContent className="p-3.5">
                <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-[14px] text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                        <span className="text-slate-400 dark:text-slate-500 font-medium">#</span>{order.order_number}
                        {order.is_pinned && <Lock size={12} className="text-rose-500" />}
                        {/* PRIORITY BADGE */}
                        {(order.priority_level === 'high' || order.priority_level === 'critical') && (
                            <span className={`text-[9px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded border ${order.priority_level === 'critical'
                                ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800"
                                : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
                                }`}>
                                {order.priority_level === 'critical' ? 'CRIT' : 'HIGH'}
                            </span>
                        )}
                    </span>
                    <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${order.status === 'cancelled' ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800' : order.status === 'assigned' ? 'bg-blue-100/50 text-blue-700 border-blue-200/50 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' : 'bg-amber-100/50 text-amber-700 border-amber-200/50 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'}`}>
                            {order.status === 'cancelled' ? 'FAILED' : order.status}
                        </span>
                        {/* Open in New Tab Button */}
                        <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails?.(order); // Open Side Panel
                            }}
                            className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                            <ExternalLink size={14} />
                        </button>
                    </div>
                </div>
                <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-400 line-clamp-1">{order.customer_name}</p>
                <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-slate-500">
                        <MapPin size={12} className="text-slate-400" />
                        <span className="truncate leading-relaxed">{order.address}</span>
                    </div>
                    {(!order.latitude || !order.longitude) && (
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2 py-1 rounded-md w-fit border border-rose-100 dark:border-rose-800 animate-pulse">
                            <AlertCircle size={12} />
                            <span>No GPS</span>
                        </div>
                    )}
                    {(order.geocoding_confidence && order.geocoding_confidence !== 'exact') && (
                        <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md w-fit border ${order.geocoding_confidence === 'failed' ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border-rose-100 dark:border-rose-800' : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800'}`}>
                            <AlertTriangle size={12} />
                            <span>{order.geocoding_confidence === 'failed' ? 'GPS Failed' : 'Unverified GPS'}</span>
                        </div>
                    )}
                    {(order.time_window_start || order.time_window_end) && (
                        <div className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-md w-fit">
                            <Clock size={12} />
                            <span>
                                {order.time_window_start?.slice(0, 5) || 'Any'} - {order.time_window_end?.slice(0, 5) || 'Any'}
                            </span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

/**
 * DROPPABLE DRIVER CONTAINER COMPONENT
 */
function DroppableDriverContainer({ driver, orders, children, isLocked = false }: { driver: Driver, orders: Order[], children: React.ReactNode, isLocked?: boolean }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `driver-${driver.id}`,
        data: { driver }
    })

    const [isExpanded, setIsExpanded] = React.useState(false)

    return (
        <div
            ref={setNodeRef}
            className={`bg-white dark:bg-slate-900 border rounded-[20px] p-2.5 transition-all duration-200 shadow-sm ${isLocked
                ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 opacity-70'
                : isOver
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 ring-4 ring-blue-500/20 scale-[1.02] z-10 relative'
                    : 'border-slate-200/60 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
        >
            <div
                className="flex items-center justify-between mb-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 -m-2.5 p-3 rounded-[20px] transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2.5">
                    {/* Expand/Collapse Arrow */}
                    <div className={`p-1 rounded-md transition-colors ${isExpanded ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                        <svg
                            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    {isLocked && <Lock size={14} className="text-rose-500" />}
                    <div className={`w-2 h-2 rounded-full ${driver.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <span className={`font-bold text-[14px] ${isLocked ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{driver.name}</span>
                    {isLocked && <span className="text-[10px] bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-rose-200 dark:border-rose-800">LOCKED</span>}
                </div>
                <span className={`text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${driver.max_orders && orders.length >= driver.max_orders ? 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' : 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {orders.length}{driver.max_orders ? `/${driver.max_orders}` : ''} orders
                </span>
            </div>

            {/* Collapsible Orders List */}
            {isExpanded && (
                <div className="space-y-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/50 min-h-[40px]">
                    {children}
                    {orders.length === 0 && <p className="text-[12px] font-bold text-slate-400 text-center py-4 bg-slate-50 dark:bg-slate-800/30 rounded-[16px] border border-dashed border-slate-200 dark:border-slate-800">{isLocked ? 'Upgrade to unlock' : 'No orders assigned'}</p>}
                </div>
            )}
        </div>
    )
}

/**
 * DROPPABLE UNASSIGNED AREA
 */
function UnassignedArea({ children, count }: { children: React.ReactNode, count: number }) {
    const { setNodeRef, isOver } = useDroppable({
        id: 'unassigned-zone'
    })

    return (
        <div
            ref={setNodeRef}
            className="flex flex-col min-h-0 flex-shrink-0 h-full"
        >
            <h2 className="text-[11px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest flex items-center gap-2 mb-3 px-2 pt-2">
                <AlertCircle size={14} /> Unassigned ({count})
            </h2>
            <div
                className={`flex-1 p-2 space-y-3 transition-colors rounded-[24px] ${isOver ? 'bg-blue-50/50 dark:bg-blue-900/20 ring-4 ring-blue-500/20' : ''}`}
            >
                {count === 0 && !isOver ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center text-slate-400 dark:text-slate-500 text-[13px] font-bold bg-white/50 dark:bg-slate-900/30 rounded-[20px] border border-dashed border-slate-200 dark:border-slate-800 shadow-sm">
                        <span className="text-2xl mb-2">🎉</span>
                        All orders assigned!
                    </div>
                ) : children}
            </div>
        </div>
    )
}


/**
 * MAIN PAGE COMPONENT
 */
export default function PlannerPage() {
    const router = useRouter()
    const { toast } = useToast()
    const { theme } = useTheme()
    const isDesktop = useMediaQuery('(min-width: 768px)')

    // Data State
    const [orders, setOrders] = useState<Order[]>([])
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRetryingGeocode, setIsRetryingGeocode] = useState(false)
    const [companyId, setCompanyId] = useState<string | null>(null)
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null) // For Quick View Sheet

    // Offline driver assignment confirmation
    const [offlineAssignConfirm, setOfflineAssignConfirm] = useState<{
        show: boolean; orderId: string; driverId: string; driverName: string
    }>({ show: false, orderId: '', driverId: '', driverName: '' })

    // Subscription State
    const [driverLimit, setDriverLimit] = useState(1)
    const [isSubscriptionExpired, setIsSubscriptionExpired] = useState(false)

    const [optimizationReport, setOptimizationReport] = useState<{
        totalProcessed: number
        assigned: number
        unassigned: number
        problematic: number
        driverBreakdown: { driverId: string, driverName: string, orderCount: number }[]
        issues: { reason: string, count: number, orders: string[] }[]
        driverDiagnostics?: { name: string, valid: boolean, lat: number, lng: number, address?: string }[]
        capacityWarnings?: { driverName: string, orderCount: number, maxOrders: number | null, totalWeightLbs: number, vehicleCapacityLbs: number | null }[]
        shiftViolations?: { driverName: string, shiftEnd: string, estimatedFinish: string, orderCount: number }[]
    } | null>(null)

    // Map State
    const [mapCenter, setMapCenter] = useState<[number, number]>([34.0522, -118.2437])

    // Optimization Strategy
    const [strategy, setStrategy] = useState<OptimizationStrategy>('efficient')

    // Driver Selection State
    const [selectedDrivers, setSelectedDrivers] = useState<string[]>([])

    // Optimization Mode
    const [optimizationMode, setOptimizationMode] = useState<'morning' | 'reoptimize'>('morning')

    // Route Start Time (configurable, default 8 AM)
    const [routeStartHour, setRouteStartHour] = useState(8)

    useEffect(() => {
        // Auto-select all drivers when list loads
        if (drivers.length > 0 && selectedDrivers.length === 0) {
            setSelectedDrivers(drivers.map(d => d.id))
        }
    }, [drivers])

    // Split Suggestions State
    const [splitSuggestions, setSplitSuggestions] = useState<SplitSuggestion[]>([])
    const [isSplitModalOpen, setIsSplitModalOpen] = useState(false)
    const [pendingOptimization, setPendingOptimization] = useState(false)

    // Driver Selection Logic
    const toggleDriverSelection = (driverId: string) => {
        setSelectedDrivers(prev =>
            prev.includes(driverId)
                ? prev.filter(id => id !== driverId)
                : [...prev, driverId]
        )
    }

    const toggleAllDrivers = () => {
        if (selectedDrivers.length === drivers.length) {
            setSelectedDrivers([])
        } else {
            setSelectedDrivers(drivers.map(d => d.id))
        }
    }

    // Drag State
    const [activeDragId, setActiveDragId] = useState<string | null>(null)

    // Sensors - Optimized for Mobile (higher thresholds to prevent jumpiness)
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 8, // Allow quick drag without long delays for desktop
            }
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 200, // Hold-to-drag — allows normal scroll on touch devices
                tolerance: 8 // Forgiveness for finger wiggle
            }
        }),
        useSensor(KeyboardSensor)
    )

    useEffect(() => {
        fixLeafletIcons() // Run Leaflet Fix
        fetchData()

        // Realtime Subscription (non-blocking)
        let channel: any = null

        try {
            channel = supabase
                .channel('planner_updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => fetchData())
                .subscribe((status) => {
                    if (status === 'CHANNEL_ERROR') {
                        // Realtime subscription failed
                    }
                })
        } catch (error) {
            // App continues to work without realtime
        }

        return () => {
            if (channel) {
                try {
                    supabase.removeChannel(channel)
                } catch (e) {
                    // Ignore cleanup error
                }
            }
        }
    }, [])

    async function fetchData() {
        setIsLoading(true)
        try {
            // Auth with retry for Capacitor async storage
            let userId: string | undefined
            const session = await waitForSession()

            if (session?.user) {
                userId = session.user.id
            }

            // On web, getSession() may time out due to navigator.locks — fallback to getUser()
            if (!userId) {
                try {
                    const { data: userData } = await supabase.auth.getUser()
                    if (userData.user) userId = userData.user.id
                } catch { }
            }

            if (!userId) {
                router.push('/login')
                return
            }

            // Get User + Subscription Limit
            const { data: user } = await supabase.from('users').select('company_id, role, driver_limit').eq('id', userId).single()
            if (!user || user.role === 'driver') { router.replace('/orders'); return }

            setCompanyId(user.company_id)

            // Set subscription limit
            const limit = user.driver_limit || 1
            setDriverLimit(limit)

            // Get Active Data
            const [ordersRes, driversRes] = await Promise.all([
                supabase.from('orders').select('*').eq('company_id', user.company_id).not('status', 'in', '("delivered","cancelled")'),
                supabase.from('drivers').select('*').eq('company_id', user.company_id).eq('status', 'active')
            ])

            if (ordersRes.data) setOrders(ordersRes.data)
            if (driversRes.data) {
                setDrivers(driversRes.data)

                // Check if subscription is expired (more drivers than limit)
                const activeDriverCount = driversRes.data.length
                setIsSubscriptionExpired(activeDriverCount > limit)
            }

            // Center Map
            if (ordersRes.data?.[0]?.latitude) {
                setMapCenter([ordersRes.data[0].latitude!, ordersRes.data[0].longitude!])
            }
        } catch (e) { toast({ title: "Failed to load planner data", type: "error" }) }
        finally { setIsLoading(false) }
    }

    // Use shared helper from lib/driver-status.ts
    const isDriverReallyOnline = isDriverOnline

    // Helper: Format relative time
    function formatRelativeTime(timestamp: string): string {
        const date = new Date(timestamp)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 1000 / 60)

        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins}m ago`

        const diffHours = Math.floor(diffMins / 60)
        if (diffHours < 24) return `${diffHours}h ago`

        const diffDays = Math.floor(diffHours / 24)
        return `${diffDays}d ago`
    }

    async function handleOptimize(skipSuggestions = false) {
        // Validation Checks
        if (drivers.length === 0) {
            toast({
                title: "Optimization Failed",
                description: "No active drivers found. Please go to the 'Drivers' page and mark drivers as Active.",
                type: 'error',
            })
            return
        }

        if (orders.length === 0) {
            toast({
                title: "Optimization Failed",
                description: "No orders found to optimize.",
                type: 'error',
            })
            return
        }

        // if (!confirm('Run Smart Optimization? This will reassign unlocked orders.')) return

        setIsLoading(true)
        try {
            // dynamic import the optimizer only when needed
            const { optimizeRoute } = await import('@/lib/optimizer')

            // Filter out cancelled/delivered orders from auto-optimization
            const ordersToOptimize = orders.filter(o => o.status !== 'cancelled' && o.status !== 'delivered')

            // Check for orders without GPS
            const noGpsCount = ordersToOptimize.filter(o => !o.latitude || !o.longitude).length

            // Check for Unverified Addresses
            const unverifiedOrders = ordersToOptimize.filter(o => o.geocoding_confidence && o.geocoding_confidence !== 'exact')

            // Check for Duplicate GPS
            const duplicateGroups: { address: string, count: number, orders: string[] }[] = []
            const gpsMap = new Map<string, string[]>()

            ordersToOptimize.forEach(o => {
                if (o.latitude && o.longitude) {
                    const key = `${o.latitude.toFixed(6)},${o.longitude.toFixed(6)}`
                    if (!gpsMap.has(key)) gpsMap.set(key, [])
                    gpsMap.get(key)!.push(o.order_number || o.id)
                }
            })

            gpsMap.forEach((ids, key) => {
                if (ids.length > 1) {
                    // Find original order to get address (for display only)
                    const firstId = ids[0]
                    const originalOrder = ordersToOptimize.find(o => (o.order_number || o.id) === firstId)
                    const address = originalOrder ? originalOrder.address : 'Unknown Address'

                    duplicateGroups.push({ address, count: ids.length, orders: ids })
                }
            })

            // WARNING IF ISSUES FOUND
            if (unverifiedOrders.length > 0 || duplicateGroups.length > 0) {
                let warningMsg = '⚠️ PRE-OPTIMIZATION WARNING:\n\n'

                if (unverifiedOrders.length > 0) {
                    warningMsg += `• ${unverifiedOrders.length} orders have UNVERIFIED addresses (Low Confidence).\n`
                }

                if (duplicateGroups.length > 0) {
                    warningMsg += `• ${duplicateGroups.length} groups of orders share EXACT GPS coordinates (potential duplicates).\n`
                    duplicateGroups.forEach(g => {
                        warningMsg += `   - "${g.address}": ${g.count} orders (${g.orders.slice(0, 3).join(', ')}${g.orders.length > 3 ? '...' : ''})\n`
                    })
                }

                warningMsg += '\nAre you sure you want to proceed with optimization?'

                if (!confirm(warningMsg)) {
                    setIsLoading(false)
                    return
                }
            }

            // If ALL orders are invalid, stop here.
            if (noGpsCount === ordersToOptimize.length && ordersToOptimize.length > 0) {
                toast({
                    title: "Optimization Failed",
                    description: "All available orders are missing GPS data. Optimization cannot proceed.",
                    type: 'error'
                })
                setIsLoading(false)
                return
            }

            if (noGpsCount > 0) {
                toast({
                    title: "Optimization Partial Warning",
                    description: `${noGpsCount} orders were skipped because they lack GPS coordinates.`,
                    type: 'error'
                })
            }

            // 🛑 SUBSCRIPTION ENFORCEMENT: 
            // 1. Filter by User Selection
            const selectedDriverObjects = drivers.filter(d => selectedDrivers.includes(d.id))

            if (selectedDriverObjects.length === 0) {
                toast({
                    title: "No Drivers Selected",
                    description: "Please select at least one driver to proceed.",
                    type: "error"
                })
                setIsLoading(false)
                return
            }

            // 2. Enforce Limit
            const allowedDrivers = selectedDriverObjects.slice(0, driverLimit)

            if (allowedDrivers.length < selectedDriverObjects.length) {
                toast({
                    title: "Subscription Restricted",
                    description: `Optimization will only use your first ${driverLimit} selected driver${driverLimit === 1 ? '' : 's'}. Upgrade to unlock parallel routing for all ${selectedDriverObjects.length} drivers.`,
                    type: "info"
                })
            }

            // --- FEATURE 3: Balanced Strategy Support ---
            if (strategy === 'balanced' && !skipSuggestions) {
                const suggestions = calculateEvenSplit(ordersToOptimize, allowedDrivers)

                // If there's action to be taken, show modal
                const needsAction = suggestions.some(s => s.action !== 'keep')
                if (needsAction) {
                    setSplitSuggestions(suggestions)
                    setIsSplitModalOpen(true)
                    setIsLoading(false)
                    return // Stop here, wait for confirmation
                }
            }

            // Run the algorithm
            const result = await optimizeRoute(ordersToOptimize, allowedDrivers, strategy, optimizationMode, routeStartHour)

            // Update Local State
            setOrders(result.orders)

            // Save to Database (Batch Update)
            // Only update routing fields — never overwrite delivered/cancelled orders
            const routingUpdates = result.orders
                .filter(o => o.status !== 'delivered' && o.status !== 'cancelled')
                .map(o => ({
                    id: o.id,
                    driver_id: o.driver_id,
                    status: o.driver_id ? 'assigned' : 'pending',
                    route_index: o.route_index || null,
                    tracking_token: o.driver_id && !o.tracking_token ? crypto.randomUUID() : (o.tracking_token || null),
                    updated_at: new Date().toISOString(),
                }))

            // Use individual updates instead of upsert to avoid overwriting other fields
            const updatePromises = routingUpdates.map(u =>
                supabase.from('orders').update({
                    driver_id: u.driver_id,
                    status: u.status,
                    route_index: u.route_index,
                    tracking_token: u.tracking_token,
                    updated_at: u.updated_at,
                }).eq('id', u.id)
            )
            const results = await Promise.all(updatePromises)
            const error = results.find(r => r.error)?.error

            if (error) {
                throw error
            }

            // Fire-and-forget: send tracking emails for newly assigned orders
            const previousOrderMap = new Map(ordersToOptimize.map(o => [o.id, o]))
            // Use result.orders (full data) for email check since routingUpdates is minimal
            const ordersWithEmail = result.orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled')
            ordersWithEmail.forEach(order => {
                const prev = previousOrderMap.get(order.id)
                const trackingToken = routingUpdates.find(u => u.id === order.id)?.tracking_token
                const isNewlyAssigned = order.driver_id && (!prev?.driver_id || prev.driver_id !== order.driver_id)
                if (isNewlyAssigned && (order as any).customer_email && trackingToken) {
                    supabase.functions.invoke('send-tracking-email', {
                        body: {
                            order_id: order.id,
                            event_type: 'assigned',
                            tracking_url: `${window.location.origin}/track/${trackingToken}`
                        }
                    }).catch(() => {}) // fire-and-forget
                }
            })

            // Notify affected drivers about route update
            const affectedDriverIds = [...new Set(result.orders.filter(o => o.driver_id).map(o => o.driver_id!))]
            affectedDriverIds.forEach(dId => {
                const driverOrderCount = result.orders.filter(o => o.driver_id === dId).length
                NotificationService.notifyDriver(
                    dId,
                    'route_updated',
                    'Route Updated',
                    `Your route has been optimized — ${driverOrderCount} order${driverOrderCount === 1 ? '' : 's'} assigned`,
                    { route: '/my-editor' }
                )
            })

            // Generate Optimization Report
            const assignedOrders = result.orders.filter(o => o.driver_id)
            const unassignedOrders = result.orders.filter(o => !o.driver_id)

            // Driver Breakdown
            const driverBreakdown = drivers.map(driver => ({
                driverId: driver.id,
                driverName: driver.name,
                orderCount: assignedOrders.filter(o => o.driver_id === driver.id).length
            })).filter(d => d.orderCount > 0)

            // Issues Analysis
            const issues: { reason: string, count: number, orders: string[] }[] = []

            const noGpsOrders = ordersToOptimize.filter(o => !o.latitude || !o.longitude)
            if (noGpsOrders.length > 0) {
                issues.push({
                    reason: 'Missing GPS Coordinates',
                    count: noGpsOrders.length,
                    orders: noGpsOrders.map(o => o.order_number || o.id)
                })
            }

            const lowConfidenceOrders = ordersToOptimize.filter(o => o.geocoding_confidence && o.geocoding_confidence !== 'exact')
            if (lowConfidenceOrders.length > 0) {
                issues.push({
                    reason: 'Unverified Address / Low Confidence',
                    count: lowConfidenceOrders.length,
                    orders: lowConfidenceOrders.map(o => o.order_number || o.id)
                })
            }

            const lockedOrders = ordersToOptimize.filter(o => o.is_pinned)
            if (lockedOrders.length > 0) {
                issues.push({
                    reason: 'Locked to Driver (Manual Assignment)',
                    count: lockedOrders.length,
                    orders: lockedOrders.map(o => o.order_number || o.id)
                })
            }

            if (unassignedOrders.length > 0) {
                issues.push({
                    reason: 'Could Not Be Assigned (Distance/Capacity Constraints)',
                    count: unassignedOrders.length,
                    orders: unassignedOrders.map(o => o.order_number || o.id)
                })
            }

            setOptimizationReport({
                totalProcessed: ordersToOptimize.length,
                assigned: assignedOrders.length,
                unassigned: unassignedOrders.length,
                problematic: noGpsOrders.length + lockedOrders.length,
                driverBreakdown,
                issues,
                driverDiagnostics: (result as any).debug?.drivers,
                capacityWarnings: result.warnings?.capacityWarnings || [],
                shiftViolations: result.warnings?.shiftViolations || [],
            })

            toast({
                title: "Optimization Complete",
                description: `${assignedOrders.length} orders assigned to ${driverBreakdown.length} drivers.`,
                type: 'success',
            })

        } catch (error: any) {
            // Try to extract useful info
            let msg = 'Unknown Error'
            if (error?.message) msg = error.message
            if (error?.code) msg += ` (Code: ${error.code})`
            if (error?.details) msg += ` Details: ${error.details} `
            if (error?.hint) msg += ` Hint: ${error.hint} `

            alert(`Optimization Failed: ${msg} `)
        } finally {
            setIsLoading(false)
        }
    }

    async function retryFailedGeocoding() {
        if (!companyId) return
        setIsRetryingGeocode(true)
        try {
            const { data: failedOrders } = await supabase
                .from('orders')
                .select('id, address, city, state, zip_code')
                .eq('company_id', companyId)
                .is('latitude', null)
                .not('status', 'in', '("delivered","cancelled")')

            if (!failedOrders?.length) {
                toast({ title: "No orders need geocoding", type: "info" })
                return
            }

            let fixed = 0
            for (const order of failedOrders) {
                try {
                    const result = await smartGeocode(
                        order.address || '', order.city || '', order.state || '', order.zip_code || ''
                    )
                    if (result) {
                        const updates: Record<string, any> = {
                            latitude: result.lat, longitude: result.lng,
                            geocoding_confidence: result.confidence,
                            geocoded_address: `${result.foundAddress} [${result.strategy}]`,
                            geocoding_attempted_at: new Date().toISOString()
                        }
                        if (result.correctedAddress) {
                            updates.address = result.correctedAddress
                        }
                        const { error: planGeoErr } = await supabase.from('orders').update(updates).eq('id', order.id)
                        if (planGeoErr) console.error(`Planner geocode save failed for order ${order.id}:`, planGeoErr.message)
                        else fixed++
                    } else {
                        const { error: planFailErr } = await supabase.from('orders').update({
                            geocoding_confidence: 'failed',
                            geocoding_attempted_at: new Date().toISOString(),
                            geocoded_address: 'All geocoding strategies failed'
                        }).eq('id', order.id)
                        if (planFailErr) console.error(`Planner geocode failure mark failed:`, planFailErr.message)
                    }
                } catch {
                    // Continue with next order
                }
            }

            toast({
                title: fixed > 0 ? `Fixed ${fixed}/${failedOrders.length} orders` : "Could not fix addresses",
                description: fixed > 0 ? "GPS coordinates updated" : "Addresses may need manual correction",
                type: fixed > 0 ? "success" : "error"
            })
            fetchData()
        } catch (error: any) {
            toast({ title: "Retry failed", description: error.message, type: "error" })
        } finally {
            setIsRetryingGeocode(false)
        }
    }

    // Handlers
    function handleDragStart(event: DragStartEvent) {
        setActiveDragId(event.active.id as string)

        // Add haptic feedback on mobile
        if (typeof window !== 'undefined') {
            if ('vibrate' in navigator) {
                navigator.vibrate(50)
            }
            document.body.classList.add('dragging-active')
        }
    }

    function handleDragCancel() {
        setActiveDragId(null)
        if (typeof window !== 'undefined') {
            document.body.classList.remove('dragging-active')
        }
    }

    async function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        setActiveDragId(null)

        if (typeof window !== 'undefined') {
            document.body.classList.remove('dragging-active')
        }

        if (!over) return

        const orderId = active.id as string
        const targetId = over.id as string

        // Determine destination
        let newDriverId: string | null = null
        if (targetId.startsWith('driver-')) {
            newDriverId = targetId.replace('driver-', '')

            // Driver limit is enforced at the DB level when adding drivers.
            // All existing drivers are valid for order assignment.
        } else if (targetId === 'unassigned-zone') {
            newDriverId = null
        } else {
            return // Dropped somewhere invalid
        }

        // ⚠️ CAPACITY WARNING: Warn (but don't block) if driver is over max capacity
        if (newDriverId) {
            const targetDriver = drivers.find(d => d.id === newDriverId)
            if (targetDriver?.max_orders) {
                const currentOrderCount = orders.filter(o => o.driver_id === newDriverId && o.id !== orderId).length
                if (currentOrderCount >= targetDriver.max_orders) {
                    toast({
                        title: "⚠️ Over Capacity",
                        description: `${targetDriver.name} now has ${currentOrderCount + 1} orders (max ${targetDriver.max_orders}).`,
                        type: "error"
                    })
                    // Continue — don't block, just warn
                }
            }
        }

        // ⚠️ Warn if assigning to an offline driver
        if (newDriverId) {
            const targetDriver = drivers.find(d => d.id === newDriverId)
            if (targetDriver && !isDriverOnline(targetDriver)) {
                setOfflineAssignConfirm({
                    show: true,
                    orderId,
                    driverId: newDriverId,
                    driverName: targetDriver.name || 'This driver'
                })
                return // STOP: Wait for confirmation
            }
        }

        // Generate tracking_token if assigning to a driver and order doesn't have one
        const draggedOrder = orders.find(o => o.id === orderId)
        const newTrackingToken = newDriverId && !draggedOrder?.tracking_token ? crypto.randomUUID() : (draggedOrder?.tracking_token || null)

        // Optimistic Update
        setOrders(prev => prev.map(o => {
            if (o.id === orderId) {
                return {
                    ...o,
                    driver_id: newDriverId,
                    status: newDriverId ? 'assigned' : 'pending',
                    // Lock if assigned to a driver manually
                    is_pinned: !!newDriverId,
                    tracking_token: newTrackingToken
                }
            }
            return o
        }))

        // Database Update
        const { error } = await supabase
            .from('orders')
            .update({
                driver_id: newDriverId,
                status: newDriverId ? 'assigned' : 'pending',
                is_pinned: !!newDriverId,
                tracking_token: newTrackingToken
            })
            .eq('id', orderId)

        if (error) {
            toast({ title: 'Failed to update order', description: error.message, type: 'error' })
            fetchData() // Revert
        } else {
            const order = orders.find(o => o.id === orderId)
            const previousDriverId = order?.driver_id

            // Notify NEW driver about assignment
            if (newDriverId && order) {
                NotificationService.notifyDriver(
                    newDriverId,
                    'order_assigned',
                    'New Order Assigned',
                    `Order #${order.order_number} has been assigned to you`,
                    { order_id: orderId, route: `/my-editor?id=${orderId}` }
                )
            }

            // Notify PREVIOUS driver about unassignment (if order was taken from them)
            if (previousDriverId && previousDriverId !== newDriverId && order) {
                NotificationService.notifyDriver(
                    previousDriverId,
                    'order_unassigned',
                    'Order Removed',
                    `Order #${order.order_number} has been removed from your route`,
                    { order_id: orderId, route: '/my-editor' }
                )
            }
        }
    }

    // Confirm assignment to offline driver
    async function confirmOfflineAssignment() {
        const { orderId, driverId } = offlineAssignConfirm
        setOfflineAssignConfirm({ show: false, orderId: '', driverId: '', driverName: '' })

        // Optimistic Update
        setOrders(prev => prev.map(o => {
            if (o.id === orderId) {
                return { ...o, driver_id: driverId, status: 'assigned', is_pinned: true }
            }
            return o
        }))

        const { error } = await supabase
            .from('orders')
            .update({ driver_id: driverId, status: 'assigned', is_pinned: true })
            .eq('id', orderId)

        if (error) {
            toast({ title: 'Failed to update order', description: error.message, type: 'error' })
            fetchData()
        } else {
            const order = orders.find(o => o.id === orderId)
            const previousDriverId = order?.driver_id

            if (order) {
                NotificationService.notifyDriver(
                    driverId,
                    'order_assigned',
                    'New Order Assigned',
                    `Order #${order.order_number} has been assigned to you`,
                    { order_id: orderId, route: `/my-editor?id=${orderId}` }
                )
            }

            if (previousDriverId && previousDriverId !== driverId && order) {
                NotificationService.notifyDriver(
                    previousDriverId,
                    'order_unassigned',
                    'Order Removed',
                    `Order #${order.order_number} has been removed from your route`,
                    { order_id: orderId, route: '/my-editor' }
                )
            }
        }
    }

    // Map Theme
    const [mapTheme, setMapTheme] = useState<'light' | 'dark'>(() => theme === 'dark' ? 'dark' : 'light')

    function toggleMapTheme() {
        setMapTheme(prev => prev === 'light' ? 'dark' : 'light')
    }

    // Derived State
    const unassignedOrders = orders.filter(o => !o.driver_id)
    const activeDragOrder = orders.find(o => o.id === activeDragId)

    return (
        <>
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="flex w-full bg-slate-50 dark:bg-slate-950 overflow-hidden" style={{ height: '100dvh' }}>
                {/* SIDEBAR - Desktop Only (conditional render to avoid dnd-kit duplicate IDs) */}
                {isDesktop && <div className="flex w-[420px] border-r border-slate-200/60 dark:border-slate-800 flex-col bg-slate-50/50 dark:bg-slate-950 z-20 shadow-[8px_0_30px_rgba(0,0,0,0.04)] transition-colors">
                    <div className="px-6 py-5 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl flex-shrink-0 safe-area-pt">
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Route Planner</h1>
                        <p className="text-[14px] font-semibold text-slate-500 dark:text-slate-400 mt-1">Drag orders to assign manually.</p>
                    </div>

                    {/* SCROLLABLE CONTENT AREA */}
                    <div className="flex-1 overflow-y-auto flex flex-col min-h-0 pb-20 custom-scrollbar overscroll-y-contain">
                        {/* GLOBAL WARNING: MISSING GPS */}
                        {orders.filter(o => !o.latitude || !o.longitude).length > 0 && (
                            <div className="mx-5 mt-5 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 rounded-[24px] flex items-start gap-3 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-400 to-red-500 opacity-20"></div>
                                <AlertCircle className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" size={18} />
                                <div className="space-y-1">
                                    <h3 className="text-[14px] font-black tracking-tight text-rose-800 dark:text-rose-300">
                                        {orders.filter(o => !o.latitude || !o.longitude).length} Orders Missing GPS
                                    </h3>
                                    <p className="text-[12px] font-semibold text-rose-600/80 dark:text-rose-400/80 leading-relaxed">
                                        These orders are hidden from the map but appear in the list below marked "No GPS".
                                    </p>
                                </div>
                            </div>
                        )}
                        <div className="p-5 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/50 flex-shrink-0">
                            <div className="mb-6">
                                <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2.5 pl-1">
                                    Optimization Strategy
                                </label>
                                <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-200/50 dark:bg-slate-800/50 rounded-[20px]">
                                    {(['fastest', 'balanced', 'efficient'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setStrategy(s)}
                                            className={`text-[13px] font-bold py-2.5 rounded-[16px] transition-all capitalize ${strategy === s
                                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm scale-[1.02]'
                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-700/50'
                                                }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Driver Selection */}
                            <div className="mb-6">
                                <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2 px-1 flex justify-between">
                                    <span>Select Drivers</span>
                                    <span className="text-slate-400">{selectedDrivers.length} / {drivers.length}</span>
                                </label>

                                <div className="space-y-3">
                                    {/* Quick Actions */}
                                    <div className="flex gap-3 text-[13px] mb-3 pl-1 font-bold">
                                        <button onClick={() => setSelectedDrivers(drivers.map(d => d.id))} className="text-blue-600 hover:text-blue-700">All</button>
                                        <span className="text-slate-300 dark:text-slate-700">|</span>
                                        <button onClick={() => setSelectedDrivers(drivers.filter(d => isDriverReallyOnline(d)).map(d => d.id))} className="text-emerald-600 hover:text-emerald-700">
                                            Online ({drivers.filter(d => isDriverReallyOnline(d)).length})
                                        </button>
                                        <span className="text-slate-300 dark:text-slate-700">|</span>
                                        <button onClick={() => setSelectedDrivers([])} className="text-rose-600 hover:text-rose-700">None</button>
                                    </div>

                                    {/* Driver Checkboxes */}
                                    <div className="max-h-[200px] overflow-y-auto space-y-1.5 bg-white dark:bg-slate-900 rounded-[28px] p-3 border border-slate-200/60 dark:border-slate-800 shadow-sm custom-scrollbar">
                                        {drivers.map(driver => {
                                            const isOnline = isDriverReallyOnline(driver)
                                            const isSelected = selectedDrivers.includes(driver.id)

                                            return (
                                                <label
                                                    key={driver.id}
                                                    className={`flex items-center gap-3 p-3 rounded-[20px] cursor-pointer transition-colors ${isSelected
                                                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30'
                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                                                        }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedDrivers([...selectedDrivers, driver.id])
                                                            } else {
                                                                setSelectedDrivers(selectedDrivers.filter(id => id !== driver.id))
                                                            }
                                                        }}
                                                        className="h-4 w-4 rounded-md border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/20"
                                                    />

                                                    {/* Online Status */}
                                                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-300 dark:bg-slate-600'}`} />

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-[14px] font-bold truncate ${isOnline ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                                                {driver.name}
                                                            </span>
                                                            <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-black ${isOnline
                                                                ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                                }`}>
                                                                {isOnline ? 'Online' : 'Offline'}
                                                            </span>
                                                        </div>
                                                        {!isOnline && driver.last_location_update && (
                                                            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                                                Seen: {formatRelativeTime(driver.last_location_update)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </label>
                                            )
                                        })}
                                        {drivers.length === 0 && (
                                            <p className="text-[13px] font-bold text-slate-500 dark:text-slate-400 text-center py-4">No drivers found</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Warning if no drivers selected */}
                            {selectedDrivers.length === 0 && (
                                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 rounded-[24px] mb-5 border border-amber-200/60 dark:border-amber-900/40 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-500 opacity-30"></div>
                                    <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                                    <p className="text-[13px] font-bold">Please select at least one driver to optimize routes.</p>
                                </div>
                            )}

                            <Button
                                onClick={() => handleOptimize(false)}
                                disabled={isLoading}
                                className="w-full h-14 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.3)] text-[16px] font-black tracking-wide transition-all active:scale-[0.98] rounded-2xl border-0 flex items-center justify-center group mb-2"
                            >
                                <Sparkles size={20} className={`mr-2 ${isLoading ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'}`} />
                                {isLoading ? 'Optimizing Routes...' : 'Smart Optimize Routes'}
                            </Button>
                        </div>

                        {/* Optimization Mode Toggle */}
                        <div className="m-5 flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm">
                            <input
                                type="checkbox"
                                id="reoptimize-mode"
                                checked={optimizationMode === 'reoptimize'}
                                onChange={(e) => setOptimizationMode(e.target.checked ? 'reoptimize' : 'morning')}
                                className="h-5 w-5 rounded-md border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/20 shrink-0"
                            />
                            <label htmlFor="reoptimize-mode" className="text-sm cursor-pointer flex-1 min-w-0">
                                <span className="font-black text-slate-900 dark:text-white">Use driver current locations</span>
                                <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                                    {optimizationMode === 'reoptimize'
                                        ? '📍 Routes start from where drivers are now (mid-day re-routing)'
                                        : '🏢 Routes start from depot/warehouse (morning planning)'}
                                </span>
                            </label>
                        </div>

                        {/* Route Start Time — only shown in morning mode */}
                        {optimizationMode === 'morning' && (
                            <div className="mx-5 mb-5 flex items-center gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-[16px] shadow-sm">
                                <Clock size={16} className="text-slate-500 shrink-0" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">Start Time</span>
                                <select
                                    value={routeStartHour}
                                    onChange={(e) => setRouteStartHour(parseInt(e.target.value))}
                                    className="ml-auto text-sm font-bold bg-slate-100 dark:bg-slate-800 border-0 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                >
                                    {Array.from({ length: 18 }, (_, i) => i + 4).map(h => (
                                        <option key={h} value={h}>
                                            {h > 12 ? `${h - 12}:00 PM` : h === 12 ? '12:00 PM' : `${h}:00 AM`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Workload Dashboard */}
                        <div className="px-5 mb-5">
                            <WorkloadDashboard />
                        </div>

                        {/* Split Suggestions */}
                        <SplitSuggestionsModal
                            open={isSplitModalOpen}
                            onOpenChange={setIsSplitModalOpen}
                            suggestions={splitSuggestions}
                            onConfirm={() => handleOptimize(true)}
                        />

                        <div className="px-5 mb-5 flex flex-col min-h-0 flex-shrink-0">
                            <div className="max-h-[30vh] overflow-y-auto rounded-[24px] border border-slate-200/60 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 p-2 shadow-sm custom-scrollbar">
                                <UnassignedArea count={unassignedOrders.length}>
                                    {unassignedOrders.map(order => (
                                        <DraggableOrderCard key={order.id} order={order} onViewDetails={setSelectedOrder} />
                                    ))}
                                </UnassignedArea>
                            </div>
                        </div>

                        {/* Droppable Drivers List */}
                        <div className="border-t border-slate-200/60 dark:border-slate-800/60 bg-white/30 dark:bg-slate-900/30 flex flex-col flex-shrink-0 pt-5">
                            <div className="px-5 pb-2 flex-shrink-0">
                                <h2 className="text-[11px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest flex items-center gap-2 pl-1">
                                    <Truck size={14} /> Assigned Drivers ({drivers.length})
                                </h2>
                            </div>
                            <div className="p-5 pt-2 space-y-4">
                                {drivers.map((driver, index) => (
                                    <DroppableDriverContainer
                                        key={driver.id}
                                        driver={driver}
                                        orders={orders.filter(o => o.driver_id === driver.id)}
                                        isLocked={index >= driverLimit}
                                    >
                                        {orders.filter(o => o.driver_id === driver.id).map(order => (
                                            <DraggableOrderCard key={order.id} order={order} onViewDetails={setSelectedOrder} />
                                        ))}
                                    </DroppableDriverContainer>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>}
                {/* MAP AREA — DESKTOP ONLY (conditional render) */}
                {isDesktop && <div className="flex flex-1 relative h-full z-10">
                    {/* Map Theme Toggle */}
                    <div className="absolute top-6 right-6 z-[500]">
                        <button
                            onClick={toggleMapTheme}
                            title="Toggle Map Theme"
                            className="h-12 w-12 rounded-[20px] bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center justify-center text-xl hover:scale-105 active:scale-95 transition-transform"
                        >
                            {mapTheme === 'dark' ? '🌙' : '☀️'}
                        </button>
                    </div>

                    <MapContainer key={`${mapCenter[0]} -${mapCenter[1]} `} center={mapCenter} zoom={13} className="h-full w-full bg-slate-100 dark:bg-slate-900 z-0" style={{ height: '100%', width: '100%', minHeight: '100%' }}>
                        <MapResizer />
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url={mapTheme === 'dark'
                                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
                        />
                        {/* Driver Meters (Depots) */}
                        {drivers.map(driver => (
                            driver.default_start_lat && driver.default_start_lng && (
                                <Marker
                                    key={`driver - ${driver.id} `}
                                    position={[driver.default_start_lat, driver.default_start_lng]}
                                    icon={typeof window !== 'undefined' ? require('leaflet').icon({
                                        iconUrl: 'https://cdn-icons-png.flaticon.com/512/713/713342.png',
                                        iconSize: [30, 30],
                                        className: 'hue-rotate-180'
                                    }) : undefined}
                                >
                                    <Popup>
                                        <div className="p-1">
                                            <strong className="block text-sm">{driver.name} (Start)</strong>
                                            <div className="text-xs text-slate-500 dark:text-slate-400">{driver.default_start_address}</div>
                                        </div>
                                    </Popup>
                                </Marker>
                            )
                        ))}
                        {/* Driver Routes (Polylines) */}
                        {drivers.map((driver, index) => {
                            const driverOrders = orders
                                .filter(o => o.driver_id === driver.id && o.latitude && o.longitude)
                                .sort((a, b) => (a.route_index || 0) - (b.route_index || 0))

                            if (driverOrders.length === 0) return null

                            const positions: [number, number][] = []

                            // Start from depot if available
                            if (driver.default_start_lat && driver.default_start_lng) {
                                positions.push([driver.default_start_lat, driver.default_start_lng])
                            }

                            // Add Order points
                            driverOrders.forEach(o => positions.push([o.latitude!, o.longitude!]))

                            // Assign color based on driver index
                            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1']
                            const color = colors[index % colors.length]

                            return (
                                <React.Fragment key={`route - ${driver.id} `}>
                                    <Polyline positions={positions} pathOptions={{ color, weight: 4, opacity: 0.7 }} />
                                </React.Fragment>
                            )
                        })}

                        {/* Order Markers */}
                        {orders.map(order => {
                            if (!order.latitude || !order.longitude) return null

                            const isCancelled = order.status === 'cancelled'
                            const customIcon = (typeof window !== 'undefined' && isCancelled)
                                ? require('leaflet').icon({
                                    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                                    iconSize: [25, 41],
                                    iconAnchor: [12, 41],
                                    popupAnchor: [1, -34],
                                    className: 'hue-rotate-[140deg]' // Blue -> Red shift
                                })
                                : null

                            return (
                                <Marker
                                    key={order.id}
                                    position={[order.latitude, order.longitude]}
                                    {...(customIcon ? { icon: customIcon } : {})}
                                >
                                    <Popup>
                                        <div className="p-1">
                                            <strong className="block text-sm">{order.customer_name}</strong>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{order.address}</div>
                                            <div className="flex gap-1">
                                                <div className={`text - [10px] font - bold px - 1 rounded w - fit ${order.driver_id ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'} `}>
                                                    {order.driver_id ? 'Assigned' : 'Unassigned'}
                                                </div>
                                                {order.route_index !== null && order.driver_id && (
                                                    <div className="text-[10px] font-bold px-1.5 rounded-full bg-slate-800 text-white">
                                                        #{order.route_index}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            )
                        })}
                    </MapContainer>
                </div>}

                {/* ============================================= */}
                {/* MOBILE PLANNER UI — Card/List layout           */}
                {/* Conditional render to avoid dnd-kit duplicate IDs */}
                {/* ============================================= */}
                {!isDesktop && <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-y-auto overscroll-y-contain pb-36" style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 0.5rem)` }}>
                    {/* Header */}
                    <div className="px-5 pt-3 pb-4 border-b border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl sticky top-0 z-30 shadow-sm">
                        <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Route Planner</h1>
                        <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">Assign orders to drivers & optimize routes</p>
                    </div>

                    {/* Stats Bar */}
                    <div className="grid grid-cols-3 gap-3 px-5 py-5">
                        <div className="bg-white dark:bg-slate-900 rounded-[24px] p-4 text-center shadow-sm border border-slate-200/60 dark:border-slate-800 border-b-4 border-b-blue-500">
                            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{orders.length}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mt-1">Total</div>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-[24px] p-4 text-center shadow-sm border border-emerald-200/60 dark:border-emerald-900/40 border-b-4 border-b-emerald-500">
                            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 tracking-tight">{orders.filter(o => o.driver_id).length}</div>
                            <div className="text-[11px] text-emerald-600 dark:text-emerald-500 font-bold uppercase tracking-widest mt-1">Assigned</div>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-[24px] p-4 text-center shadow-sm border border-amber-200/60 dark:border-amber-900/40 border-b-4 border-b-amber-500">
                            <div className="text-2xl font-black text-amber-700 dark:text-amber-400 tracking-tight">{unassignedOrders.length}</div>
                            <div className="text-[11px] text-amber-600 dark:text-amber-500 font-bold uppercase tracking-widest mt-1">Unassigned</div>
                        </div>
                    </div>

                    {/* GPS Warning */}
                    {orders.filter(o => !o.latitude || !o.longitude).length > 0 && (
                        <div className="mx-5 mb-5 p-5 bg-rose-50/80 dark:bg-rose-950/40 backdrop-blur-md border border-rose-200/50 dark:border-rose-800/50 rounded-3xl flex items-center gap-4 shadow-sm shadow-rose-100/50 dark:shadow-none relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-rose-400/5 to-red-500/10 opacity-50" />
                            <div className="p-2.5 bg-rose-100 dark:bg-rose-900/50 rounded-full relative z-10 shrink-0">
                                <AlertCircle className="text-rose-600 dark:text-rose-400" size={20} strokeWidth={2.5} />
                            </div>
                            <div className="relative z-10 flex-1 pr-2">
                                <p className="text-[14px] font-extrabold tracking-tight text-rose-800 dark:text-rose-300">
                                    {orders.filter(o => !o.latitude || !o.longitude).length} orders missing GPS
                                </p>
                                <p className="text-[12px] font-semibold text-rose-600/90 dark:text-rose-400/80 mt-0.5 leading-tight">These cannot be optimized until fixed.</p>
                            </div>
                        </div>
                    )}

                    {/* Strategy Selector */}
                    <div className="px-5 mb-5">
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2.5 pl-1">
                            Strategy
                        </label>
                        <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-200/50 dark:bg-slate-800/50 rounded-[20px]">
                            {(['fastest', 'balanced', 'efficient'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStrategy(s)}
                                    className={`text-[13px] font-bold py-2.5 rounded-[16px] transition-all capitalize ${strategy === s
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm scale-[1.02]'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-700/50'
                                        }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Driver Selection */}
                    <div className="px-5 mb-5">
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5 pl-1">
                            Drivers ({selectedDrivers.length}/{drivers.length})
                        </label>
                        <div className="flex gap-3 text-[13px] mb-3 pl-1 font-bold">
                            <button onClick={() => setSelectedDrivers(drivers.map(d => d.id))} className="text-blue-600 hover:text-blue-700">All</button>
                            <span className="text-slate-300 dark:text-slate-700">|</span>
                            <button onClick={() => setSelectedDrivers(drivers.filter(d => isDriverReallyOnline(d)).map(d => d.id))} className="text-emerald-600 hover:text-emerald-700">
                                Online ({drivers.filter(d => isDriverReallyOnline(d)).length})
                            </button>
                            <span className="text-slate-300 dark:text-slate-700">|</span>
                            <button onClick={() => setSelectedDrivers([])} className="text-rose-600 hover:text-rose-700">None</button>
                        </div>
                        <div className="space-y-1.5 bg-white dark:bg-slate-900 rounded-[28px] p-3 border border-slate-200/60 dark:border-slate-800 shadow-sm max-h-[160px] overflow-y-auto">
                            {drivers.map(driver => {
                                const isOnline = isDriverReallyOnline(driver)
                                const isSelected = selectedDrivers.includes(driver.id)
                                return (
                                    <label
                                        key={driver.id}
                                        className={`flex items-center gap-3 p-3 rounded-[20px] cursor-pointer transition-colors ${isSelected
                                            ? 'bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedDrivers([...selectedDrivers, driver.id])
                                                } else {
                                                    setSelectedDrivers(selectedDrivers.filter(id => id !== driver.id))
                                                }
                                            }}
                                            className="h-4 w-4 rounded-md border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/20"
                                        />
                                        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                        <span className={`text-[14px] font-bold truncate ${isOnline ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                            {driver.name}
                                        </span>
                                        <span className={`text-[10px] uppercase tracking-widest ml-auto px-2 py-1 rounded-full font-black ${isOnline
                                            ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                            {isOnline ? 'Online' : 'Offline'}
                                        </span>
                                    </label>
                                )
                            })}
                            {drivers.length === 0 && (
                                <p className="text-[13px] font-bold text-slate-500 dark:text-slate-400 text-center py-4">No drivers found</p>
                            )}
                        </div>
                    </div>

                    {/* Optimization Mode Toggle */}
                    <div className="mx-5 mb-5 flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm">
                        <input
                            type="checkbox"
                            id="mobile-reoptimize-mode"
                            checked={optimizationMode === 'reoptimize'}
                            onChange={(e) => setOptimizationMode(e.target.checked ? 'reoptimize' : 'morning')}
                            className="h-5 w-5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/20 shrink-0"
                        />
                        <label htmlFor="mobile-reoptimize-mode" className="text-sm cursor-pointer flex-1 min-w-0">
                            <span className="font-black text-slate-900 dark:text-white">Use driver current locations</span>
                            <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                                {optimizationMode === 'reoptimize'
                                    ? '📍 Routes start from where drivers are now (mid-day re-routing)'
                                    : '🏢 Routes start from depot/warehouse (morning planning)'}
                            </span>
                        </label>
                    </div>

                    {/* Route Start Time (Mobile) — only shown in morning mode */}
                    {optimizationMode === 'morning' && (
                        <div className="mx-5 mb-4 flex items-center gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm">
                            <Clock size={16} className="text-slate-500 shrink-0" />
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Start Time</span>
                            <select
                                value={routeStartHour}
                                onChange={(e) => setRouteStartHour(parseInt(e.target.value))}
                                className="ml-auto text-sm font-bold bg-slate-100 dark:bg-slate-800 border-0 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            >
                                {Array.from({ length: 18 }, (_, i) => i + 4).map(h => (
                                    <option key={h} value={h}>
                                        {h > 12 ? `${h - 12}:00 PM` : h === 12 ? '12:00 PM' : `${h}:00 AM`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* No Drivers Warning */}
                    {selectedDrivers.length === 0 && (
                        <div className="mx-5 mb-5 flex items-center gap-2.5 px-4 py-3 bg-amber-50/80 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 rounded-2xl border border-amber-200/50 dark:border-amber-900/40">
                            <AlertCircle size={16} className="shrink-0 text-amber-500 dark:text-amber-400" />
                            <p className="text-[13px] font-semibold">Select at least one driver to optimize routes.</p>
                        </div>
                    )}

                    {/* Optimize Button */}
                    <div className="px-5 mb-6">
                        <Button
                            onClick={() => handleOptimize(false)}
                            disabled={isLoading}
                            className="w-full h-14 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.3)] text-[16px] font-black tracking-wide transition-all active:scale-[0.98] rounded-2xl border-0 flex items-center justify-center group"
                        >
                            <Sparkles size={20} className={`mr-2 ${isLoading ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'}`} />
                            {isLoading ? 'Optimizing Routes...' : 'Smart Optimize Routes'}
                        </Button>
                    </div>

                    {/* Workload Dashboard */}
                    <div className="px-5 mb-6">
                        <WorkloadDashboard />
                    </div>

                    <SplitSuggestionsModal
                        open={isSplitModalOpen}
                        onOpenChange={setIsSplitModalOpen}
                        suggestions={splitSuggestions}
                        onConfirm={() => handleOptimize(true)}
                    />

                    {/* Divider */}
                    <div className="border-t border-slate-200/50 dark:border-slate-800/50 mx-5 mb-5" />

                    {/* Split view: Unassigned Orders + Drivers side by side for easy drag-and-drop */}
                    <div className="px-5 pb-5 flex flex-col gap-4" style={{ minHeight: '60vh' }}>
                        {/* Unassigned Orders - scrollable */}
                        <div className="flex-1 min-h-[300px] h-full flex flex-col rounded-[24px] border border-slate-200/60 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 p-2 shadow-sm">
                            <div className="flex-1 overflow-y-auto">
                                <UnassignedArea count={unassignedOrders.length}>
                                    {unassignedOrders.map(order => (
                                        <DraggableOrderCard key={order.id} order={order} onViewDetails={setSelectedOrder} />
                                    ))}
                                </UnassignedArea>
                            </div>
                        </div>

                        {/* Drivers - scrollable, always visible below */}
                        <div className="flex-1 min-h-[300px] flex flex-col rounded-[24px] border border-slate-200/60 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 p-3 shadow-sm">
                            <h2 className="text-[11px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest flex items-center gap-2 mb-3 pl-1 pt-1">
                                <Truck size={14} /> Drivers ({drivers.length})
                            </h2>
                            <div className="flex-1 overflow-y-auto space-y-3">
                                {drivers.map((driver, index) => (
                                    <DroppableDriverContainer
                                        key={driver.id}
                                        driver={driver}
                                        orders={orders.filter(o => o.driver_id === driver.id)}
                                        isLocked={index >= driverLimit}
                                    >
                                        {orders.filter(o => o.driver_id === driver.id).map(order => (
                                            <DraggableOrderCard key={order.id} order={order} onViewDetails={setSelectedOrder} />
                                        ))}
                                    </DroppableDriverContainer>
                                ))}
                            </div>
                        </div>
                    </div>


                    {/* SPACER FOR MOBILE BOTTOM NAV - Ensures scroll clears the bottom bar */}
                    <div className="h-48 flex-shrink-0 w-full" />
                </div>}

                {/* DRAG OVERLAY (Visual Feedback) */}
                <DragOverlay dropAnimation={{
                    duration: 250,
                    easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' // Smooth ease-out, no overshoot
                }}>
                    {activeDragOrder ? (
                        <div className="w-[340px] max-w-[80vw]">
                            <DraggableOrderCard order={activeDragOrder} isOverlay />
                        </div>
                    ) : null}
                </DragOverlay>

                {/* QUICK VIEW SHEET */}
                <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
                    <SheetContent className="safe-area-pt">
                        <SheetHeader>
                            <SheetTitle>Order Details</SheetTitle>
                            <SheetDescription>#{selectedOrder?.order_number}</SheetDescription>
                        </SheetHeader>
                        {selectedOrder && (
                            <div className="space-y-4 mt-6 px-4">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-muted-foreground">Customer</h3>
                                    <p className="font-semibold">{selectedOrder.customer_name}</p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400">{selectedOrder.phone}</p>
                                </div>

                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-muted-foreground">Address</h3>
                                    <p className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/50 p-2 rounded">{selectedOrder.address}, {selectedOrder.city}</p>
                                </div>

                                <div className="flex gap-4">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
                                        <span className={`inline - block px - 2 py - 1 rounded - full text - xs font - bold ${selectedOrder.status === 'assigned' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'} `}>
                                            {selectedOrder.status}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-medium text-muted-foreground">Assigned Driver</h3>
                                        <p className="text-sm">{selectedOrder.driver_id ? drivers.find(d => d.id === selectedOrder.driver_id)?.name || 'Assigned' : 'Unassigned'}</p>
                                    </div>
                                </div>

                                <div className="pt-4 border-t">
                                    <Button className="w-full" onClick={() => router.push(`/my-editor?id=${selectedOrder.id}`)}>
                                        <ExternalLink size={14} className="mr-2" />
                                        Open Full Editor
                                    </Button>
                                </div>
                            </div>
                        )}
                    </SheetContent>
                </Sheet>

                {/* OPTIMIZATION REPORT DIALOG */}
                <Sheet open={!!optimizationReport} onOpenChange={(open) => !open && setOptimizationReport(null)}>
                    <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto pt-14 pb-32 z-[10000] bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-3xl border-l-white/50 [&>button]:top-14 [&>button]:right-6">
                        <SheetHeader className="px-2">
                            <SheetTitle className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white mt-2">
                                <Sparkles className="text-blue-600 dark:text-blue-400" size={24} />
                                Optimization Report
                            </SheetTitle>
                            <SheetDescription className="text-slate-500 dark:text-slate-400">
                                Smart route optimization results
                            </SheetDescription>
                        </SheetHeader>

                        {optimizationReport && (
                            <div className="space-y-8 mt-8 px-2">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 gap-4">
                                    <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-white/80 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-gradient-to-br from-green-400/10 to-emerald-600/5 opacity-50 transition-opacity group-hover:opacity-100" />
                                        <CardContent className="p-5 text-center relative z-10">
                                            <div className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-br from-green-600 to-emerald-500 dark:from-green-400 dark:to-emerald-300 drop-shadow-sm mb-1">{optimizationReport.assigned}</div>
                                            <div className="text-[11px] uppercase tracking-wider text-green-700 dark:text-green-400 font-bold">Assigned</div>
                                        </CardContent>
                                    </Card>

                                    <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-white/80 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-gradient-to-br from-orange-400/10 to-amber-600/5 opacity-50 transition-opacity group-hover:opacity-100" />
                                        <CardContent className="p-5 text-center relative z-10">
                                            <div className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-br from-orange-500 to-amber-500 dark:from-orange-400 dark:to-amber-300 drop-shadow-sm mb-1">{optimizationReport.unassigned}</div>
                                            <div className="text-[11px] uppercase tracking-wider text-orange-700 dark:text-orange-400 font-bold">Unassigned</div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Driver Breakdown */}
                                {optimizationReport.driverBreakdown.length > 0 && (
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <Truck size={18} className="text-blue-600 dark:text-blue-400" />
                                            Driver Assignment Breakdown
                                        </h3>
                                        <div className="space-y-3">
                                            {optimizationReport.driverBreakdown.map((driver) => (
                                                <div
                                                    key={driver.driverId}
                                                    className="flex items-center justify-between p-4 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-white/60 dark:border-slate-800 rounded-2xl shadow-sm"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-3 w-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{driver.driverName}</span>
                                                    </div>
                                                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-900/50 px-3 py-1.5 rounded-full border border-blue-200/50 dark:border-blue-800/50">
                                                        {driver.orderCount} orders
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Issues / Warnings */}
                                {optimizationReport.issues.length > 0 && (
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <AlertCircle size={18} className="text-rose-500" />
                                            Issues & Warnings
                                        </h3>
                                        <div className="space-y-3">
                                            {optimizationReport.issues.map((issue, index) => (
                                                <Card key={index} className="border-rose-200/50 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-950/20 backdrop-blur-sm shadow-sm rounded-2xl overflow-hidden">
                                                    <CardContent className="p-4">
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div className="flex-1 pr-4">
                                                                <p className="text-sm font-bold text-rose-800 dark:text-rose-300 leading-tight">{issue.reason}</p>
                                                                <p className="text-[11px] font-medium text-rose-600/80 dark:text-rose-400/80 mt-1 uppercase tracking-wider">{issue.count} affected</p>
                                                            </div>
                                                            <span className="text-xs bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 px-2.5 py-1 rounded-full font-bold border border-rose-200 dark:border-rose-800/50">
                                                                {issue.count}
                                                            </span>
                                                        </div>
                                                        <details className="mt-2">
                                                            <summary className="text-xs text-orange-700 dark:text-orange-400 cursor-pointer hover:underline">
                                                                View affected orders
                                                            </summary>
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {issue.orders.slice(0, 10).map((orderId, idx) => (
                                                                    <span
                                                                        key={idx}
                                                                        className="text-[10px] bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 px-1.5 py-0.5 rounded font-mono"
                                                                    >
                                                                        #{orderId}
                                                                    </span>
                                                                ))}
                                                                {issue.orders.length > 10 && (
                                                                    <span className="text-[10px] text-orange-600 dark:text-orange-400 px-1.5">
                                                                        +{issue.orders.length - 10} more
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </details>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Capacity Warnings */}
                                {optimizationReport.capacityWarnings && optimizationReport.capacityWarnings.length > 0 && (
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <AlertTriangle size={18} className="text-amber-500" />
                                            Capacity Warnings
                                        </h3>
                                        <div className="space-y-3">
                                            {optimizationReport.capacityWarnings.map((warning, index) => (
                                                <div
                                                    key={index}
                                                    className="flex items-start gap-3 p-4 bg-amber-50/60 dark:bg-amber-950/20 backdrop-blur-md border border-amber-200/60 dark:border-amber-800/30 rounded-2xl shadow-sm"
                                                >
                                                    <span className="text-amber-500 mt-0.5 shrink-0">&#9888;&#65039;</span>
                                                    <div>
                                                        <p className="text-sm font-bold text-amber-800 dark:text-amber-300 leading-tight">
                                                            {warning.driverName} has {warning.orderCount} orders but max capacity is {warning.maxOrders}
                                                        </p>
                                                        {warning.totalWeightLbs > 0 && warning.vehicleCapacityLbs && (
                                                            <p className="text-[11px] font-medium text-amber-600/80 dark:text-amber-400/80 mt-1">
                                                                Weight: {warning.totalWeightLbs.toFixed(1)} lbs / {warning.vehicleCapacityLbs} lbs capacity
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Shift Violations */}
                                {optimizationReport.shiftViolations && optimizationReport.shiftViolations.length > 0 && (
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <Clock size={18} className="text-amber-500" />
                                            Shift Violations
                                        </h3>
                                        <div className="space-y-3">
                                            {optimizationReport.shiftViolations.map((violation, index) => (
                                                <div
                                                    key={index}
                                                    className="flex items-start gap-3 p-4 bg-amber-50/60 dark:bg-amber-950/20 backdrop-blur-md border border-amber-200/60 dark:border-amber-800/30 rounded-2xl shadow-sm"
                                                >
                                                    <span className="text-amber-500 mt-0.5 shrink-0">&#9888;&#65039;</span>
                                                    <div>
                                                        <p className="text-sm font-bold text-amber-800 dark:text-amber-300 leading-tight">
                                                            {violation.driverName}&apos;s route finishes at {violation.estimatedFinish} but shift ends at {violation.shiftEnd}
                                                        </p>
                                                        <p className="text-[11px] font-medium text-amber-600/80 dark:text-amber-400/80 mt-1 uppercase tracking-wider">
                                                            {violation.orderCount} orders assigned
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Driver Diagnostics (Debug Info for User) */}
                                {optimizationReport.driverDiagnostics && (
                                    <div className="space-y-4 pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <Truck size={18} className="text-purple-500" />
                                            Drivers Availability Check
                                        </h3>
                                        <div className="grid grid-cols-1 gap-3">
                                            {optimizationReport.driverDiagnostics.map((d, i) => (
                                                <div
                                                    key={i}
                                                    className={`flex items-center justify-between p-3.5 rounded-2xl text-xs border backdrop-blur-md shadow-sm transition-all ${d.valid
                                                        ? 'bg-emerald-50/60 border-emerald-200/60 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800/30 dark:text-emerald-100'
                                                        : 'bg-rose-50/60 border-rose-200/60 text-rose-900 dark:bg-rose-950/20 dark:border-rose-800/30 dark:text-rose-100'
                                                        }`}
                                                >
                                                    <div className="flex flex-col gap-1 pr-3">
                                                        <span className="font-bold text-sm tracking-tight">{d.name}</span>
                                                        <span className={`text-[10px] truncate max-w-[220px] block font-medium uppercase tracking-wider ${d.valid ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-rose-600/80 dark:text-rose-400/80'}`} title={d.address}>
                                                            {d.address || `Lat: ${d.lat?.toFixed(4) || '?'}, Lng: ${d.lng?.toFixed(4) || '?'}`}
                                                        </span>
                                                    </div>
                                                    <span className={`font-black tracking-widest px-2.5 py-1 rounded border ${d.valid
                                                        ? 'bg-emerald-100/80 text-emerald-700 border-emerald-200/50 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700/50'
                                                        : 'bg-rose-100/80 text-rose-700 border-rose-200/50 dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-700/50'
                                                        }`}>
                                                        {d.valid ? 'READY' : 'INVALID'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Success Summary */}
                                {optimizationReport.assigned > 0 && (
                                    <div className="p-5 mt-4 relative overflow-hidden bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/80 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] rounded-3xl">
                                        <div className="absolute inset-0 bg-gradient-to-br from-green-400/10 to-emerald-600/5 opacity-50 pointer-events-none" />
                                        <div className="relative z-10">
                                            <div className="flex items-center gap-2.5 mb-3">
                                                <div className="p-1.5 bg-green-100 dark:bg-green-900/50 rounded-full">
                                                    <CheckCircle2 className="text-green-600 dark:text-green-400" size={20} strokeWidth={2.5} />
                                                </div>
                                                <h4 className="font-extrabold text-green-900 dark:text-green-300 text-base">Optimization Successful!</h4>
                                            </div>
                                            <p className="text-[13px] font-medium text-green-800/90 dark:text-green-200/90 leading-relaxed">
                                                <span className="font-bold text-green-700 dark:text-green-400">{optimizationReport.assigned}</span> out of {optimizationReport.totalProcessed} orders were successfully assigned to <span className="font-bold text-green-700 dark:text-green-400">{optimizationReport.driverBreakdown.length}</span> driver(s).
                                            </p>
                                            {optimizationReport.unassigned > 0 && (
                                                <div className="mt-3 p-2.5 bg-white/40 dark:bg-black/20 rounded-xl border border-white/50 dark:border-white/5">
                                                    <p className="text-[12px] font-semibold text-emerald-700/90 dark:text-emerald-400/90 flex items-center gap-1.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                        {optimizationReport.unassigned} orders remain unassigned and require manual review.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Close Button */}
                                <Button
                                    className="w-full h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 font-bold text-base shadow-lg shadow-blue-900/20 dark:shadow-white/10 transition-all active:scale-[0.98] mt-6"
                                    onClick={() => setOptimizationReport(null)}
                                >
                                    Close Report
                                </Button>
                            </div>
                        )}
                    </SheetContent>
                </Sheet>

                {/* ORDER DETAILS SHEET (QUICK VIEW) */}
                <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
                    <SheetContent className="safe-area-pt">
                        {selectedOrder && (
                            <>
                                <SheetHeader>
                                    <div className="flex items-center justify-between">
                                        <SheetTitle>Order #{selectedOrder.order_number}</SheetTitle>
                                        <span className={`text - xs px - 2 py - 1 rounded - full border uppercase font - bold ${selectedOrder.status === 'assigned' ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' : 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800'} `}>
                                            {selectedOrder.status}
                                        </span>
                                    </div>
                                    <SheetDescription>
                                        Customer and delivery details.
                                    </SheetDescription>
                                </SheetHeader>

                                <div className="mt-6 space-y-6 px-4">
                                    {/* PRIORITY & STATUS */}
                                    <div className="flex gap-4">
                                        {/* Priority Badge */}
                                        <div className="flex-1 p-3 rounded-lg border bg-muted/20 flex flex-col items-center justify-center gap-1 text-center">
                                            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Priority</span>
                                            {selectedOrder.priority_level === 'critical' ? (
                                                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-bold bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded text-sm">
                                                    <AlertCircle size={14} /> CRITICAL
                                                </span>
                                            ) : selectedOrder.priority_level === 'high' ? (
                                                <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-bold bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded text-sm">
                                                    <AlertTriangle size={14} /> HIGH
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 dark:text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-sm">NORMAL</span>
                                            )}
                                        </div>

                                        {/* Lock Status */}
                                        <div className="flex-1 p-3 rounded-lg border bg-muted/20 flex flex-col items-center justify-center gap-1 text-center">
                                            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Optimization</span>
                                            {selectedOrder.is_pinned ? (
                                                <span className="flex items-center gap-1 text-red-600 font-bold text-sm">
                                                    <Lock size={14} /> PINNED
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-green-600 font-bold text-sm">
                                                    <Unlock size={14} /> AUTO
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* CUSTOMER INFO */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                <UserIcon size={16} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">Customer</p>
                                                <p className="font-bold">{selectedOrder.customer_name}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                <MapPin size={16} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">Address</p>
                                                <p className="text-sm">{selectedOrder.address}, {selectedOrder.city} {selectedOrder.zip_code}</p>

                                                {selectedOrder.geocoding_confidence && selectedOrder.geocoding_confidence !== 'exact' && (
                                                    <p className="text-xs text-orange-600 font-medium mt-1 flex items-center gap-1">
                                                        <AlertTriangle size={10} />
                                                        Location Confidence: {selectedOrder.geocoding_confidence.toUpperCase()}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ACTION BUTTONS */}
                                    <div className="pt-4 border-t border-border space-y-3">
                                        <Link href={`/my-editor?id=${selectedOrder.id}`} className="block w-full">
                                            <Button variant="outline" className="w-full">
                                                <Edit className="mr-2 h-4 w-4" /> Edit Order Details
                                            </Button>
                                        </Link>

                                        {/* PIN / UNPIN TOGGLE */}
                                        {selectedOrder.driver_id && (
                                            <Button
                                                variant={selectedOrder.is_pinned ? "outline" : "default"}
                                                className={selectedOrder.is_pinned ? "w-full border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300" : "w-full bg-slate-900 text-white hover:bg-slate-800"}
                                                onClick={async () => {
                                                    const newPinState = !selectedOrder.is_pinned

                                                    // Optimistic
                                                    const updated = { ...selectedOrder, is_pinned: newPinState }
                                                    setSelectedOrder(updated)
                                                    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))

                                                    // DB Update
                                                    const { error } = await supabase.from('orders').update({ is_pinned: newPinState }).eq('id', selectedOrder.id)
                                                    if (error) {
                                                        toast({ title: "Failed to update pin status", type: 'error' })
                                                        // Revert
                                                        const reverted = { ...selectedOrder, is_pinned: !newPinState }
                                                        setSelectedOrder(reverted)
                                                        setOrders(prev => prev.map(o => o.id === reverted.id ? reverted : o))
                                                    } else {
                                                        toast({
                                                            title: newPinState ? "Order Pinned 🔒" : "Order Unpinned 🔓",
                                                            description: newPinState ? "Optimization will NOT move this order." : "Optimization can now move this order.",
                                                            type: 'success'
                                                        })
                                                    }
                                                }}
                                            >
                                                {selectedOrder.is_pinned ? (
                                                    <>
                                                        <Unlock className="mr-2 h-4 w-4" /> Unpin from Driver
                                                    </>
                                                ) : (
                                                    <>
                                                        <Lock className="mr-2 h-4 w-4" /> Pin to Current Driver
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </SheetContent>
                </Sheet>

            </div>
        </DndContext>

        {/* Offline Driver Assignment Warning */}
        <AlertDialog open={offlineAssignConfirm.show} onOpenChange={(open) => !open && setOfflineAssignConfirm({ show: false, orderId: '', driverId: '', driverName: '' })}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-amber-600 flex items-center gap-2">
                        <AlertTriangle size={20} /> Driver is Offline
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        <strong>{offlineAssignConfirm.driverName}</strong> is currently offline. They won&apos;t receive this order until they come back online. Are you sure you want to assign?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmOfflineAssignment} className="bg-amber-600 hover:bg-amber-700">
                        Assign Anyway
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    )
}
