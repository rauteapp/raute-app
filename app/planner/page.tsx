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
import { PullToRefresh } from '@/components/pull-to-refresh'
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
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
        id: order.id,
        data: { order }
    })

    const style: React.CSSProperties = isDragging
        ? { opacity: 0.4, willChange: 'transform', touchAction: 'none' }
        : {} // Don't set touchAction: 'none' when not dragging — it blocks page scrolling

    return (
        <Card
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onDoubleClick={() => onViewDetails?.(order)} // Quick View on Double Click
            className={`cursor-grab active:cursor-grabbing hover:border-primary dark:hover:border-primary transition-colors group ${isOverlay ? 'shadow-2xl scale-105 rotate-2 border-primary' : ''} ${order.is_pinned ? 'border-l-4 border-l-red-500' : ''} ${order.status === 'cancelled' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900 opacity-80' : 'bg-card dark:bg-slate-900 border-border dark:border-slate-800'}`}
        >
            <CardContent className="p-3">
                <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm group-hover:text-primary transition-colors flex items-center gap-1">
                        #{order.order_number}
                        {order.is_pinned && <Lock size={10} className="text-red-500" />}
                        {/* PRIORITY BADGE */}
                        {(order.priority_level === 'high' || order.priority_level === 'critical') && (
                            <span className={`text-[8px] uppercase font-extrabold px-1 py-0.5 rounded border ${order.priority_level === 'critical'
                                ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                                : "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800"
                                }`}>
                                {order.priority_level === 'critical' ? 'CRIT' : 'HIGH'}
                            </span>
                        )}
                    </span>
                    <div className="flex items-center gap-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${order.status === 'cancelled' ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800 font-bold' : order.status === 'assigned' ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' : 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800'}`}>
                            {order.status === 'cancelled' ? 'FAILED' : order.status}
                        </span>
                        {/* Open in New Tab Button */}
                        <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails?.(order); // Open Side Panel
                            }}
                            className="text-muted-foreground hover:text-primary p-0.5 hover:bg-muted rounded"
                        >
                            <ExternalLink size={12} />
                        </button>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">{order.customer_name}</p>
                <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin size={10} />
                        <span className="truncate">{order.address}</span>
                    </div>
                    {(!order.latitude || !order.longitude) && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded w-fit border border-red-100 dark:border-red-800 animate-pulse">
                            <AlertCircle size={10} />
                            <span>No GPS</span>
                        </div>
                    )}
                    {(order.geocoding_confidence && order.geocoding_confidence !== 'exact') && (
                        <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded w-fit border ${order.geocoding_confidence === 'failed' ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800' : 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-100 dark:border-orange-800'}`}>
                            <AlertTriangle size={10} />
                            <span>{order.geocoding_confidence === 'failed' ? 'GPS Failed' : 'Unverified GPS'}</span>
                        </div>
                    )}
                    {(order.time_window_start || order.time_window_end) && (
                        <div className="flex items-center gap-1 text-[10px] font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded w-fit">
                            <Clock size={10} />
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
            className={`bg-card dark:bg-slate-900 border rounded-md p-2 transition-colors ${isLocked
                ? 'border-red-300 dark:border-red-900 bg-red-50/50 dark:bg-red-950/30 opacity-60'
                : isOver
                    ? 'border-primary bg-primary/5 dark:bg-primary/20 ring-2 ring-primary/20'
                    : 'border-border dark:border-slate-800'
                }`}
        >
            <div
                className="flex items-center justify-between mb-2 cursor-pointer hover:bg-muted/30 -m-2 p-2 rounded transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    {/* Expand/Collapse Arrow */}
                    <svg
                        className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {isLocked && <Lock size={14} className="text-red-500" />}
                    <div className={`w-2 h-2 rounded-full ${driver.status === 'active' ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <span className={`font-medium text-sm ${isLocked ? 'text-red-600 dark:text-red-400' : ''}`}>{driver.name}</span>
                    {isLocked && <span className="text-[10px] bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-bold">LOCKED</span>}
                </div>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {orders.length} orders
                </span>
            </div>

            {/* Collapsible Orders List */}
            {isExpanded && (
                <div className="space-y-2 pl-2 border-l-2 border-muted min-h-[20px] mt-2">
                    {children}
                    {orders.length === 0 && <p className="text-[10px] text-muted-foreground italic">{isLocked ? 'Upgrade to unlock' : 'No orders assigned'}</p>}
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
            className="flex flex-col min-h-0 flex-shrink-0"
        >
            <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-2 px-4 pt-4">
                <AlertCircle size={12} /> Unassigned ({count})
            </h2>
            <div
                className={`p-4 space-y-3 transition-colors ${isOver ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
            >
                {count === 0 && !isOver ? (
                    <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/50">
                        All orders assigned! 🎉
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

    // Data State
    const [orders, setOrders] = useState<Order[]>([])
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null) // For Quick View Sheet

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
    } | null>(null)

    // Map State
    const [mapCenter, setMapCenter] = useState<[number, number]>([34.0522, -118.2437])

    // Optimization Strategy
    const [strategy, setStrategy] = useState<OptimizationStrategy>('efficient')

    // Driver Selection State
    const [selectedDrivers, setSelectedDrivers] = useState<string[]>([])

    // Optimization Mode
    const [optimizationMode, setOptimizationMode] = useState<'morning' | 'reoptimize'>('morning')

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
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 10, // Minimum drag distance before activation
                delay: 150, // Delay prevents accidental drags on desktop
                tolerance: 5
            }
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250, // Longer delay for touch to distinguish from scroll
                tolerance: 10 // Higher tolerance for finger imprecision
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
                } catch {}
            }

            if (!userId) {
                router.push('/login')
                return
            }

            // Get User + Subscription Limit
            const { data: user } = await supabase.from('users').select('company_id, role, driver_limit').eq('id', userId).single()
            if (!user || user.role === 'driver') { router.replace('/orders'); return }

            // Set subscription limit
            const limit = user.driver_limit || 1
            setDriverLimit(limit)

            // Get Active Data
            const [ordersRes, driversRes] = await Promise.all([
                supabase.from('orders').select('*').eq('company_id', user.company_id).neq('status', 'delivered'),
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
            const result = await optimizeRoute(ordersToOptimize, allowedDrivers, strategy, optimizationMode)

            // Update Local State
            setOrders(result.orders)

            // Save to Database (Batch Update)
            const updates = result.orders.map(o => ({
                ...o, // KEEP ALL EXISTING DATA (company_id, customer_name, etc.)
                driver_id: o.driver_id,
                status: o.driver_id ? 'assigned' : 'pending',
                route_index: o.route_index || null,
            }))

            const { error } = await supabase.from('orders').upsert(updates)

            if (error) {
                throw error
            }

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
                driverDiagnostics: (result as any).debug?.drivers
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

    // Handlers
    function handleDragStart(event: DragStartEvent) {
        setActiveDragId(event.active.id as string)
        
        // Add haptic feedback on mobile
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(50)
        }
    }

    async function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        setActiveDragId(null)

        if (!over) return

        const orderId = active.id as string
        const targetId = over.id as string

        // Determine destination
        let newDriverId: string | null = null
        if (targetId.startsWith('driver-')) {
            newDriverId = targetId.replace('driver-', '')

            // 🛑 SUBSCRIPTION ENFORCEMENT: Block dispatch to drivers beyond limit
            if (newDriverId) {
                const driverIndex = drivers.findIndex(d => d.id === newDriverId)
                if (driverIndex >= driverLimit) {
                    toast({
                        title: "Subscription Limit Reached",
                        description: `You can only assign orders to your first ${driverLimit} driver${driverLimit === 1 ? '' : 's'}. Upgrade to unlock more slots.`,
                        type: "error"
                    })
                    return // Block the assignment
                }
            }
        } else if (targetId === 'unassigned-zone') {
            newDriverId = null
        } else {
            return // Dropped somewhere invalid
        }

        // Optimistic Update
        setOrders(prev => prev.map(o => {
            if (o.id === orderId) {
                return {
                    ...o,
                    driver_id: newDriverId,
                    status: newDriverId ? 'assigned' : 'pending',
                    // Lock if assigned to a driver manually
                    is_pinned: !!newDriverId
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
                is_pinned: !!newDriverId
            })
            .eq('id', orderId)

        if (error) {
            toast({ title: 'Failed to update order', description: error.message, type: 'error' })
            fetchData() // Revert
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
        <PullToRefresh onRefresh={fetchData}>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="flex w-full bg-background overflow-hidden" style={{ height: '100dvh' }}>
                    {/* SIDEBAR - Desktop Only */}
                    <div className="hidden md:flex md:w-96 border-r border-border flex-col bg-card dark:bg-card z-20 shadow-xl transition-colors">
                        <div className="p-4 border-b border-border bg-muted/20 dark:bg-muted/10 flex-shrink-0 safe-area-pt">
                            <h1 className="text-xl font-bold tracking-tight mb-1 text-foreground">Route Planner</h1>
                            <p className="text-xs text-muted-foreground">Drag orders to assign manually.</p>
                        </div>

                        {/* SCROLLABLE CONTENT AREA */}
                        <div className="flex-1 overflow-y-auto flex flex-col min-h-0 pb-20">
                            {/* GLOBAL WARNING: MISSING GPS */}
                            {orders.filter(o => !o.latitude || !o.longitude).length > 0 && (
                                <div className="m-3 mb-0 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-3 shadow-sm">
                                    <AlertCircle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={16} />
                                    <div className="space-y-1">
                                        <h3 className="text-xs font-bold text-red-800 dark:text-red-300">
                                            {orders.filter(o => !o.latitude || !o.longitude).length} Orders Missing GPS
                                        </h3>
                                        <p className="text-[10px] text-red-600 dark:text-red-400 leading-tight">
                                            These orders are hidden from the map but appear in the list below marked "No GPS".
                                        </p>
                                    </div>
                                </div>
                            )}
                            <div className="p-4 border-b border-border bg-card flex-shrink-0">
                                <div className="mb-4">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                                        Strategy
                                    </label>
                                    <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-lg">
                                        <button
                                            onClick={() => setStrategy('fastest')}
                                            className={`text - [10px] font - medium py - 1.5 rounded - md transition - all ${strategy === 'fastest' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                                                } `}
                                        >
                                            Fastest
                                        </button>
                                        <button
                                            onClick={() => setStrategy('balanced')}
                                            className={`text - [10px] font - medium py - 1.5 rounded - md transition - all ${strategy === 'balanced' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                                                } `}
                                        >
                                            Balanced
                                        </button>
                                        <button
                                            onClick={() => setStrategy('efficient')}
                                            className={`text - [10px] font - medium py - 1.5 rounded - md transition - all ${strategy === 'efficient' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                                                } `}
                                        >
                                            Efficient
                                        </button>
                                    </div>
                                </div>

                                {/* Driver Selection */}
                                <div className="mb-4">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                                        Select Drivers
                                    </label>

                                    <div className="space-y-2">
                                        {/* Quick Actions */}
                                        <div className="flex gap-2 text-xs">
                                            <button
                                                onClick={() => setSelectedDrivers(drivers.map(d => d.id))}
                                                className="text-blue-600 hover:underline"
                                            >
                                                All
                                            </button>
                                            <span className="text-muted-foreground">|</span>
                                            <button
                                                onClick={() => setSelectedDrivers(
                                                    drivers.filter(d => isDriverReallyOnline(d)).map(d => d.id)
                                                )}
                                                className="text-green-600 hover:underline"
                                            >
                                                Online ({drivers.filter(d => isDriverReallyOnline(d)).length})
                                            </button>
                                            <span className="text-muted-foreground">|</span>
                                            <button
                                                onClick={() => setSelectedDrivers([])}
                                                className="text-red-600 hover:underline"
                                            >
                                                None
                                            </button>
                                        </div>

                                        {/* Driver Checkboxes */}
                                        <div className="max-h-40 overflow-y-auto space-y-1 bg-muted/30 rounded-lg p-2 border border-border/50">
                                            {drivers.map(driver => {
                                                const isOnline = isDriverReallyOnline(driver)
                                                const isSelected = selectedDrivers.includes(driver.id)

                                                return (
                                                    <label
                                                        key={driver.id}
                                                        className={`flex items - center gap - 2 p - 2 rounded cursor - pointer transition - colors ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50 border border-transparent'
                                                            } `}
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
                                                            className="h-3 w-3 rounded border-gray-300 accent-primary"
                                                        />

                                                        {/* Online Status */}
                                                        <div className={`w - 1.5 h - 1.5 rounded - full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
                                                            } `} />

                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between">
                                                                <span className={`text - xs font - medium truncate ${isOnline ? 'text-foreground' : 'text-muted-foreground'
                                                                    } `}>
                                                                    {driver.name}
                                                                </span>
                                                                <span className={`text - [9px] px - 1 py - 0.5 rounded font - medium ${isOnline
                                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                                    } `}>
                                                                    {isOnline ? 'Online' : 'Offline'}
                                                                </span>
                                                            </div>
                                                            {!isOnline && driver.last_location_update && (
                                                                <p className="text-[9px] text-muted-foreground truncate">
                                                                    Seen: {formatRelativeTime(driver.last_location_update)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </label>
                                                )
                                            })}
                                            {drivers.length === 0 && (
                                                <p className="text-xs text-muted-foreground text-center py-2">No drivers found</p>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground text-right">
                                            {selectedDrivers.length} / {drivers.length} selected
                                        </div>
                                    </div>
                                </div>

                                {/* Warning if no drivers selected */}
                                {selectedDrivers.length === 0 && (
                                    <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 text-xs rounded-md mb-4 border border-orange-200 dark:border-orange-900">
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                        <p>Please select at least one driver to optimize routes.</p>
                                    </div>
                                )}

                                <Button
                                    onClick={() => handleOptimize(false)}
                                    disabled={isLoading}
                                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all active:scale-95 border-0"
                                >
                                    <Sparkles size={16} className={`mr - 2 ${isLoading ? 'animate-spin' : ''} `} />
                                    {isLoading ? 'Optimizing...' : 'Smart Optimize'}
                                </Button>
                            </div>

                            {/* Optimization Mode Toggle */}
                            <div className="mb-4 flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                                <input
                                    type="checkbox"
                                    id="reoptimize-mode"
                                    checked={optimizationMode === 'reoptimize'}
                                    onChange={(e) => setOptimizationMode(e.target.checked ? 'reoptimize' : 'morning')}
                                    className="h-4 w-4 rounded border-gray-300 accent-primary"
                                />
                                <label htmlFor="reoptimize-mode" className="text-sm cursor-pointer flex-1 user-select-none">
                                    <span className="font-medium text-foreground">Use driver current locations</span>
                                    <span className="block text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                        {optimizationMode === 'reoptimize'
                                            ? '📍 Routes start from where drivers are now (mid-day re-routing)'
                                            : '🏢 Routes start from depot/warehouse (morning planning)'}
                                    </span>
                                </label>
                            </div>

                            {/* Workload Dashboard */}
                            <WorkloadDashboard />

                            <SplitSuggestionsModal
                                open={isSplitModalOpen}
                                onOpenChange={setIsSplitModalOpen}
                                suggestions={splitSuggestions}
                                onConfirm={() => handleOptimize(true)}
                            />

                            <UnassignedArea count={unassignedOrders.length}>
                                {unassignedOrders.map(order => (
                                    <DraggableOrderCard key={order.id} order={order} onViewDetails={setSelectedOrder} />
                                ))}
                            </UnassignedArea>

                            {/* Droppable Drivers List */}
                            <div className="border-t border-border bg-muted/10 flex flex-col flex-shrink-0">
                                <div className="p-3 border-b border-border bg-muted/30 flex-shrink-0">
                                    <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
                                        <Truck size={12} /> Drivers ({drivers.length})
                                    </h2>
                                </div>
                                <div className="p-3 space-y-3">
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
                    </div>
                    {/* MAP AREA — DESKTOP ONLY */}
                    <div className="hidden md:block flex-1 relative z-10">
                        {/* Map Theme Toggle */}
                        <div className="absolute top-4 right-4 z-[500]">
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

                        <div className="absolute inset-0">
                            <MapContainer key={`${mapCenter[0]} -${mapCenter[1]} `} center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
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
                        </div>
                    </div>

                    {/* ============================================= */}
                    {/* MOBILE PLANNER UI — Card/List layout           */}
                    {/* ============================================= */}
                    <div className="md:hidden flex-1 flex flex-col bg-background overflow-y-auto pb-4" style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 0.5rem)` }}>
                        {/* Header */}
                        <div className="px-4 pt-2 pb-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
                            <h1 className="text-lg font-bold tracking-tight text-foreground">Route Planner</h1>
                            <p className="text-xs text-muted-foreground">Assign orders to drivers &amp; optimize routes</p>
                        </div>

                        {/* Stats Bar */}
                        <div className="grid grid-cols-3 gap-2 px-4 py-3">
                            <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-2 text-center border border-blue-100 dark:border-blue-900">
                                <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{orders.length}</div>
                                <div className="text-[10px] text-blue-600 dark:text-blue-500 font-medium">Total</div>
                            </div>
                            <div className="bg-green-50 dark:bg-green-950/40 rounded-lg p-2 text-center border border-green-100 dark:border-green-900">
                                <div className="text-lg font-bold text-green-700 dark:text-green-400">{orders.filter(o => o.driver_id).length}</div>
                                <div className="text-[10px] text-green-600 dark:text-green-500 font-medium">Assigned</div>
                            </div>
                            <div className="bg-yellow-50 dark:bg-yellow-950/40 rounded-lg p-2 text-center border border-yellow-100 dark:border-yellow-900">
                                <div className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{unassignedOrders.length}</div>
                                <div className="text-[10px] text-yellow-600 dark:text-yellow-500 font-medium">Unassigned</div>
                            </div>
                        </div>

                        {/* GPS Warning */}
                        {orders.filter(o => !o.latitude || !o.longitude).length > 0 && (
                            <div className="mx-4 mb-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-2">
                                <AlertCircle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={14} />
                                <div>
                                    <p className="text-xs font-bold text-red-800 dark:text-red-300">
                                        {orders.filter(o => !o.latitude || !o.longitude).length} orders missing GPS
                                    </p>
                                    <p className="text-[10px] text-red-600 dark:text-red-400">These cannot be optimized until GPS is resolved.</p>
                                </div>
                            </div>
                        )}

                        {/* Strategy Selector */}
                        <div className="px-4 mb-3">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                                Strategy
                            </label>
                            <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-lg">
                                {(['fastest', 'balanced', 'efficient'] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setStrategy(s)}
                                        className={`text-xs font-medium py-2 rounded-md transition-all capitalize ${strategy === s
                                            ? 'bg-background shadow text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Driver Selection */}
                        <div className="px-4 mb-3">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                                Drivers ({selectedDrivers.length}/{drivers.length})
                            </label>
                            <div className="flex gap-2 text-xs mb-2">
                                <button onClick={() => setSelectedDrivers(drivers.map(d => d.id))} className="text-blue-600 hover:underline font-medium">All</button>
                                <span className="text-muted-foreground">|</span>
                                <button onClick={() => setSelectedDrivers(drivers.filter(d => isDriverReallyOnline(d)).map(d => d.id))} className="text-green-600 hover:underline font-medium">
                                    Online ({drivers.filter(d => isDriverReallyOnline(d)).length})
                                </button>
                                <span className="text-muted-foreground">|</span>
                                <button onClick={() => setSelectedDrivers([])} className="text-red-600 hover:underline font-medium">None</button>
                            </div>
                            <div className="space-y-1 bg-muted/30 rounded-lg p-2 border border-border/50 max-h-36 overflow-y-auto">
                                {drivers.map(driver => {
                                    const isOnline = isDriverReallyOnline(driver)
                                    const isSelected = selectedDrivers.includes(driver.id)
                                    return (
                                        <label
                                            key={driver.id}
                                            className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${isSelected
                                                ? 'bg-primary/10 border border-primary/20'
                                                : 'hover:bg-muted/50 border border-transparent'
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
                                                className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
                                            />
                                            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                            <span className={`text-xs font-medium truncate ${isOnline ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                {driver.name}
                                            </span>
                                            <span className={`text-[9px] ml-auto px-1 py-0.5 rounded font-medium ${isOnline
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                                {isOnline ? 'Online' : 'Offline'}
                                            </span>
                                        </label>
                                    )
                                })}
                                {drivers.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-2">No drivers found</p>
                                )}
                            </div>
                        </div>

                        {/* Optimization Mode Toggle */}
                        <div className="mx-4 mb-3 flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                            <input
                                type="checkbox"
                                id="mobile-reoptimize-mode"
                                checked={optimizationMode === 'reoptimize'}
                                onChange={(e) => setOptimizationMode(e.target.checked ? 'reoptimize' : 'morning')}
                                className="h-4 w-4 rounded border-gray-300 accent-primary"
                            />
                            <label htmlFor="mobile-reoptimize-mode" className="text-sm cursor-pointer flex-1">
                                <span className="font-medium text-foreground">Use current locations</span>
                                <span className="block text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                    {optimizationMode === 'reoptimize'
                                        ? '📍 Routes start from where drivers are now'
                                        : '🏢 Routes start from depot (morning)'}
                                </span>
                            </label>
                        </div>

                        {/* No Drivers Warning */}
                        {selectedDrivers.length === 0 && (
                            <div className="mx-4 mb-3 flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 text-xs rounded-lg border border-orange-200 dark:border-orange-900">
                                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                <p>Select at least one driver to optimize routes.</p>
                            </div>
                        )}

                        {/* Optimize Button */}
                        <div className="px-4 mb-4">
                            <Button
                                onClick={() => handleOptimize(false)}
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all active:scale-95 border-0 py-3 text-base"
                            >
                                <Sparkles size={18} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                                {isLoading ? 'Optimizing...' : 'Smart Optimize'}
                            </Button>
                        </div>

                        {/* Workload Dashboard */}
                        <div className="px-4 mb-4">
                            <WorkloadDashboard />
                        </div>

                        <SplitSuggestionsModal
                            open={isSplitModalOpen}
                            onOpenChange={setIsSplitModalOpen}
                            suggestions={splitSuggestions}
                            onConfirm={() => handleOptimize(true)}
                        />

                        {/* Divider */}
                        <div className="border-t border-border mx-4 mb-3" />

                        {/* Unassigned Orders */}
                        <div className="px-4 mb-4">
                            <UnassignedArea count={unassignedOrders.length}>
                                {unassignedOrders.map(order => (
                                    <DraggableOrderCard key={order.id} order={order} onViewDetails={setSelectedOrder} />
                                ))}
                            </UnassignedArea>
                        </div>

                        {/* Assigned — By Driver */}
                        <div className="px-4 pb-4">
                            <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2 mb-3">
                                <Truck size={12} /> Drivers ({drivers.length})
                            </h2>
                            <div className="space-y-3">
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

                {/* DRAG OVERLAY (Visual Feedback) */}
                <DragOverlay dropAnimation={{
                    duration: 250,
                    easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' // Smooth ease-out, no overshoot
                }}>
                    {activeDragOrder ? <DraggableOrderCard order={activeDragOrder} isOverlay /> : null}
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
                    <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto safe-area-pt">
                        <SheetHeader>
                            <SheetTitle className="flex items-center gap-2">
                                <Sparkles className="text-blue-600" size={20} />
                                Optimization Report
                            </SheetTitle>
                            <SheetDescription>
                                Smart route optimization results
                            </SheetDescription>
                        </SheetHeader>

                        {optimizationReport && (
                            <div className="space-y-6 mt-6 px-4">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 gap-3">
                                    <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
                                        <CardContent className="p-4 text-center">
                                            <div className="text-3xl font-bold text-green-700 dark:text-green-400">{optimizationReport.assigned}</div>
                                            <div className="text-xs text-green-600 dark:text-green-500 font-medium mt-1">Assigned</div>
                                        </CardContent>
                                    </Card>
                                    <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950 dark:to-amber-950 border-yellow-200 dark:border-yellow-800">
                                        <CardContent className="p-4 text-center">
                                            <div className="text-3xl font-bold text-yellow-700 dark:text-yellow-400">{optimizationReport.unassigned}</div>
                                            <div className="text-xs text-yellow-600 dark:text-yellow-500 font-medium mt-1">Unassigned</div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Driver Breakdown */}
                                {optimizationReport.driverBreakdown.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <Truck size={16} className="text-blue-600" />
                                            Driver Assignment Breakdown
                                        </h3>
                                        <div className="space-y-2">
                                            {optimizationReport.driverBreakdown.map((driver) => (
                                                <div
                                                    key={driver.driverId}
                                                    className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-2 w-2 rounded-full bg-blue-600" />
                                                        <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{driver.driverName}</span>
                                                    </div>
                                                    <span className="text-sm font-bold text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded-full">
                                                        {driver.orderCount} orders
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Issues / Warnings */}
                                {optimizationReport.issues.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <AlertCircle size={16} className="text-orange-600" />
                                            Issues & Warnings
                                        </h3>
                                        <div className="space-y-3">
                                            {optimizationReport.issues.map((issue, index) => (
                                                <Card key={index} className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/50">
                                                    <CardContent className="p-3">
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex-1">
                                                                <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">{issue.reason}</p>
                                                                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">{issue.count} affected</p>
                                                            </div>
                                                            <span className="text-xs bg-orange-200 dark:bg-orange-900 text-orange-800 dark:text-orange-300 px-2 py-1 rounded-full font-bold">
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

                                {/* Driver Diagnostics (Debug Info for User) */}
                                {optimizationReport.driverDiagnostics && (
                                    <div className="space-y-3 pt-4 border-t border-border">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <Truck size={16} className="text-purple-600" />
                                            Drivers Availability Check
                                        </h3>
                                        <div className="grid grid-cols-1 gap-2">
                                            {optimizationReport.driverDiagnostics.map((d, i) => (
                                                <div key={i} className={`flex items - center justify - between p - 2 rounded text - xs border ${d.valid ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300' : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-300'} `}>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold">{d.name}</span>
                                                        <span className="opacity-70 text-[10px] truncate max-w-[250px] block" title={d.address}>
                                                            {d.address || `Lat: ${d.lat?.toFixed(4) || '?'}, Lng: ${d.lng?.toFixed(4) || '?'} `}
                                                        </span>
                                                    </div>
                                                    <span className="font-bold">{d.valid ? 'READY' : 'INVALID LOC'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Success Summary */}
                                {optimizationReport.assigned > 0 && (
                                    <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border border-green-200 dark:border-green-800 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CheckCircle2 className="text-green-600 dark:text-green-400" size={18} />
                                            <h4 className="font-bold text-green-800 dark:text-green-300">Optimization Successful!</h4>
                                        </div>
                                        <p className="text-sm text-green-700 dark:text-green-400">
                                            {optimizationReport.assigned} out of {optimizationReport.totalProcessed} orders were successfully assigned to {optimizationReport.driverBreakdown.length} driver(s).
                                        </p>
                                        {optimizationReport.unassigned > 0 && (
                                            <p className="text-xs text-green-600 dark:text-green-500 mt-2">
                                                {optimizationReport.unassigned} orders remain unassigned and require manual review.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Close Button */}
                                <Button
                                    className="w-full"
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
        </PullToRefresh>
    )
}
