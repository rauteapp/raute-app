"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, MapPin, Calendar, User as UserIcon, Phone, Package, Edit, Trash2, Clock, Undo2, CheckCircle2, Loader2, Camera as CameraIcon, X, Navigation, AlertCircle, Link2, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { supabase, type Order, type ProofImage } from "@/lib/supabase"
import { isDriverOnline } from "@/lib/driver-status"
import dynamic from "next/dynamic"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { offlineManager } from '@/lib/offline-manager'
import { geoService } from '@/lib/geo-service'
import { useToast } from "@/components/toast-provider"
import { friendlyError } from "@/lib/friendly-error"
import LocationPicker from "@/components/location-picker"
import { DriverTracker } from "@/components/driver-tracker"
import { ImageViewerModal } from "@/components/image-viewer-modal"
import { Capacitor } from '@capacitor/core'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { NotificationService } from '@/lib/notification-service'

// Dynamically import map to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })
const SignatureInput = dynamic(() => import('@/components/signature-input'), { ssr: false, loading: () => <div className="h-32 w-full bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">Loading Signature Pad...</div> })

// Fix Leaflet issue
const fixLeafletIcons = () => {
    if (typeof window !== 'undefined') {
        const L = require('leaflet')
        if (L.Icon.Default.prototype._getIconUrl) {
            delete (L.Icon.Default.prototype as any)._getIconUrl
        }
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        })
    }
}

const statusColors = {
    pending: "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
    assigned: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    in_progress: "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    delivered: "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
    cancelled: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
}

export default function ClientOrderDetails() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const orderId = searchParams.get('id')
    const { toast } = useToast()

    const [order, setOrder] = useState<Order | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isUndoDialogOpen, setIsUndoDialogOpen] = useState(false)
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [trackingLinkCopied, setTrackingLinkCopied] = useState(false)
    const [isUpdating, setIsUpdating] = useState(false)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [drivers, setDrivers] = useState<any[]>([])
    const [currentDriverId, setCurrentDriverId] = useState<string | null>(null)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null)


    // Proof Images State
    const [proofImages, setProofImages] = useState<ProofImage[]>([])
    const [isUploadingProof, setIsUploadingProof] = useState(false)

    // Cancellation Dialog State
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
    const [cancelReason, setCancelReason] = useState('')
    const [cancelNote, setCancelNote] = useState('')

    // Controlled Form State
    const [formData, setFormData] = useState<Partial<Order>>({})
    const [isGeocodingReversed, setIsGeocodingReversed] = useState(false)

    // Signature State
    const [signatureData, setSignatureData] = useState<string | null>(null)
    const [signatureKey, setSignatureKey] = useState(0)

    // Image Viewer State
    const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null)
    const [viewerImageTitle, setViewerImageTitle] = useState<string>('')

    // Out-of-Range Confirmation State
    const [outOfRangeConfirm, setOutOfRangeConfirm] = useState<{
        show: boolean
        distance: number
        proofUrl?: string | null
    }>({ show: false, distance: 0 })



    useEffect(() => {
        fixLeafletIcons()

        // Identify User & Driver
        const identifyUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setCurrentUserId(user.id)
                const { data: d } = await supabase.from('drivers').select('id').eq('user_id', user.id).maybeSingle()
                if (d) setCurrentDriverId(d.id)
            }
        }
        identifyUser()

        if (orderId) {
            fetchOrder(true)
        } else {
            // If no ID, stop loading immediately
            setIsLoading(false)
        }
    }, [orderId])

    // Sync Order to Form Data when Order Loads or Edit Sheet Opens
    useEffect(() => {
        if (order) {
            setFormData({
                order_number: order.order_number,
                customer_name: order.customer_name,
                address: order.address,
                city: order.city,
                state: order.state,
                zip_code: order.zip_code,
                phone: order.phone,
                customer_email: order.customer_email,
                delivery_date: order.delivery_date,
                notes: order.notes,
                latitude: order.latitude,
                longitude: order.longitude,
                priority_level: order.priority_level || 'normal',
                geocoding_confidence: order.geocoding_confidence,
                weight_lbs: order.weight_lbs
            })
        }
    }, [order, isEditSheetOpen])

    async function fetchOrder(isInitial = false) {
        if (!orderId) {
            setIsLoading(false)
            return
        }
        try {
            if (isInitial) setIsLoading(true)

            // Fetch User & Role
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: userProfile } = await supabase
                    .from('users')
                    .select('role, company_id')
                    .eq('id', user.id)
                    .maybeSingle()

                if (userProfile) {
                    setUserRole(userProfile.role)
                    setCurrentCompanyId(userProfile.company_id)
                    if (userProfile.role !== 'driver') {
                        // Fetch drivers with online status fields
                        const { data: driversData } = await supabase
                            .from('drivers')
                            .select('id, name, is_online, last_location_update, vehicle_type')
                            .eq('company_id', userProfile.company_id)
                            .eq('status', 'active')
                            .order('name')

                        setDrivers(driversData || [])
                    }
                }
            }

            // Fetch Order
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('id', orderId)
                .single()

            if (error) throw error
            setOrder(data)

            // Fetch Proof Images
            const { data: images, error: imagesError } = await supabase
                .from('proof_images')
                .select('*')
                .eq('order_id', orderId)
                .order('uploaded_at', { ascending: true })

            if (!imagesError && images) {
                setProofImages(images)
            }
        } catch (error: any) {
            toast({ title: 'Error fetching order', description: friendlyError(error), type: 'error' })
        } finally {
            if (isInitial) setIsLoading(false)
        }
    }




    // Helper to calc distance in meters
    function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async function updateOrderStatus(newStatus: string, proofUrl?: string | null, forceDelivery?: boolean) {
        if (!order || !orderId) return
        try {
            let locationPayload = null
            let isOutOfRange = false
            let dist = 0

            // 🔒 Block delivery if driver is offline
            if ((newStatus === 'delivered' || newStatus === 'in_progress') && userRole === 'driver' && currentDriverId) {
                const { data: driverStatus } = await supabase
                    .from('drivers')
                    .select('is_online, last_location_update')
                    .eq('id', currentDriverId)
                    .single()

                if (driverStatus && !isDriverOnline(driverStatus)) {
                    toast({
                        title: "You Must Be Online",
                        description: "Go online first before updating order status. Toggle your status from the dashboard.",
                        type: "error"
                    })
                    return
                }
            }

            // 📍 Anti-Fraud: Strict Location Check
            if (newStatus === 'delivered') {
                const loc = await geoService.getCurrentLocation()

                if (!loc) {
                    toast({ title: "Location Required", description: "You must enable GPS/Location to mark as delivered.", type: "error" })
                    return // STOP: Do not update status
                }

                locationPayload = { lat: loc.lat, lng: loc.lng }

                // Check distance if order has lat/lng
                if (order.latitude && order.longitude) {
                    dist = getDistanceMeters(loc.lat, loc.lng, order.latitude, order.longitude)

                    // Flag if > 500 meters (~1640 ft / 0.3 miles)
                    if (dist > 500) {
                        isOutOfRange = true
                        // Show confirmation dialog unless user already confirmed
                        if (!forceDelivery) {
                            setOutOfRangeConfirm({ show: true, distance: Math.round(dist), proofUrl })
                            return // STOP: Wait for user confirmation
                        }
                    }
                }
            }

            await offlineManager.queueAction('UPDATE_ORDER_STATUS', {
                orderId,
                status: newStatus,
                location: locationPayload,
                outOfRange: isOutOfRange,
                distance: dist,
                proof_url: proofUrl
            })

            // Direct DB Update (for immediate feedback) because offlineManager might be async
            if (proofUrl) {
                await supabase.from('orders').update({
                    status: newStatus,
                    proof_url: proofUrl,
                    delivered_at: new Date().toISOString(),
                    was_out_of_range: isOutOfRange,
                    delivery_distance_meters: dist || undefined
                }).eq('id', orderId)
            } else {
                await supabase.from('orders').update({
                    status: newStatus,
                    delivered_at: newStatus === 'delivered' ? new Date().toISOString() : null,
                    was_out_of_range: isOutOfRange,
                    delivery_distance_meters: dist || undefined
                }).eq('id', orderId)
            }

            // Send tracking email notification (fire-and-forget)
            if ((newStatus === 'in_progress' || newStatus === 'delivered') && order.customer_email && order.tracking_token) {
                supabase.functions.invoke('send-tracking-email', {
                    body: {
                        order_id: orderId,
                        event_type: newStatus,
                        tracking_url: `${window.location.origin}/track/${order.tracking_token}`
                    }
                }).catch(() => {})
            }

            // Optimistic Update
            setOrder(prev => prev ? {
                ...prev,
                status: newStatus as any,
                delivered_at: newStatus === 'delivered' ? new Date().toISOString() : prev.delivered_at,
                was_out_of_range: isOutOfRange,
                delivery_distance_meters: dist || prev.delivery_distance_meters,
            } : null)

            // Notify managers about delivery
            if (newStatus === 'delivered' && currentCompanyId) {
                const notifType = isOutOfRange ? 'out_of_range' : 'delivery_completed'
                const notifTitle = isOutOfRange
                    ? `Out-of-Range Delivery`
                    : `Order Delivered`
                const notifBody = isOutOfRange
                    ? `Order #${order.order_number} was delivered ${Math.round(dist)}m away from destination`
                    : `Order #${order.order_number} has been delivered to ${order.customer_name}`
                NotificationService.notifyManagers(
                    currentCompanyId,
                    notifType,
                    notifTitle,
                    notifBody,
                    { order_id: orderId, route: `/my-editor?id=${orderId}` }
                )
            }

        } catch (error) {
            toast({ title: 'Failed to update status', type: 'error' })
        }
    }

    // Cancellation with reason
    async function handleCancelOrder() {
        if (!cancelReason) return
        if (cancelReason === 'other' && !cancelNote.trim()) return

        try {
            setIsUpdating(true)
            const { error } = await supabase
                .from('orders')
                .update({
                    status: 'cancelled',
                    cancellation_reason: cancelReason,
                    cancellation_note: cancelNote || null,
                    cancelled_by: currentUserId,
                    cancelled_at: new Date().toISOString()
                })
                .eq('id', orderId)

            if (error) throw error

            setOrder(prev => prev ? {
                ...prev,
                status: 'cancelled' as any,
                cancellation_reason: cancelReason,
                cancellation_note: cancelNote || null,
                cancelled_by: currentUserId,
                cancelled_at: new Date().toISOString()
            } : null)

            toast({ title: 'Order cancelled', type: 'success' })
            setIsCancelDialogOpen(false)
            setCancelReason('')
            setCancelNote('')
        } catch (error) {
            toast({ title: 'Failed to cancel order', type: 'error' })
        } finally {
            setIsUpdating(false)
        }
    }

    const DRIVER_CANCEL_REASONS = [
        { value: 'patient_not_home', label: 'Patient Not Home' },
        { value: 'patient_refused', label: 'Patient Refused Delivery' },
        { value: 'address_not_found', label: 'Address Not Found' },
        { value: 'wrong_equipment', label: 'Wrong Equipment Loaded' },
        { value: 'other', label: 'Other' },
    ]

    const MANAGER_CANCEL_REASONS = [
        ...DRIVER_CANCEL_REASONS.slice(0, -1), // All driver reasons except "other"
        { value: 'duplicate_order', label: 'Duplicate Order' },
        { value: 'insurance_issue', label: 'Insurance/Authorization Issue' },
        { value: 'manager_cancelled', label: 'Cancelled by Manager' },
        { value: 'other', label: 'Other' },
    ]

    // NEW: Reverse Geocoding when Pin Moves (Using Utility)
    async function handlePinUpdate(lat: number, lng: number) {
        // 1. Update State immediately (UI snappy)
        setFormData(prev => ({ ...prev, latitude: lat, longitude: lng, geocoding_confidence: 'exact' }))

        // 2. Fetch Address Details
        try {
            setIsGeocodingReversed(true)

            // Dynamic import to avoid circular dep if any, or just direct
            const { reverseGeocode } = await import("@/lib/geocoding")
            const data = await reverseGeocode(lat, lng)

            if (data) {
                // Update Form
                setFormData(prev => ({
                    ...prev,
                    address: data.address || prev.address,
                    city: data.city || prev.city,
                    state: data.state || prev.state,
                    zip_code: data.zip || prev.zip_code
                }))
            }
        } catch (error: any) {
            toast({ title: 'Could not auto-fill address', description: friendlyError(error, 'Could not find address for this location.'), type: 'error' })
        } finally {
            setIsGeocodingReversed(false)
        }
    }

    // Delete a specific proof image
    async function deleteProofImage(imageId: string, imageUrl: string) {
        try {
            // Extract filename from URL
            const urlParts = imageUrl.split('/')
            const filename = urlParts[urlParts.length - 1]

            // Delete from database
            const { error: dbError } = await supabase
                .from('proof_images')
                .delete()
                .eq('id', imageId)

            if (dbError) throw dbError

            // Delete from storage
            await supabase.storage
                .from('proofs')
                .remove([filename])

            // Update local state
            setProofImages(prev => prev.filter(img => img.id !== imageId))

            toast({ title: 'Image deleted successfully', type: 'success' })
        } catch (error: any) {
            toast({ title: 'Failed to delete image', description: friendlyError(error), type: 'error' })
        }
    }

    async function handleDelete() {
        if (!orderId) return
        try { setIsDeleting(true); const { error } = await supabase.from('orders').delete().eq('id', orderId); if (error) throw error; router.push('/orders') } catch (error: any) { toast({ title: 'Delete Failed', description: friendlyError(error), type: 'error' }) } finally { setIsDeleting(false) }
    }

    async function handleEditSubmit(e: React.FormEvent) {
        e.preventDefault()
        const effectiveOrderId = orderId || order?.id
        if (!effectiveOrderId || !order) {
            return
        }

        try {
            setIsUpdating(true)

            // Geocode if location is missing but address is present (Fallback)
            let finalLat = formData.latitude
            let finalLng = formData.longitude

            // Use utility for forward geocoding fallback too
            if (!finalLat || !finalLng) {
                const { geocodeAddress } = await import("@/lib/geocoding")
                const geocoded = await geocodeAddress(`${formData.address || ''}, ${formData.city || ''}, ${formData.state || ''} ${formData.zip_code || ''}`)
                if (geocoded) {
                    finalLat = geocoded.lat
                    finalLng = geocoded.lng
                }
            }

            const updatedPayload = {
                order_number: formData.order_number,
                customer_name: formData.customer_name,
                address: formData.address,
                city: formData.city,
                state: formData.state,
                zip_code: formData.zip_code,
                phone: formData.phone,
                customer_email: formData.customer_email || null,
                delivery_date: formData.delivery_date,
                notes: formData.notes,
                latitude: finalLat,
                longitude: finalLng,
                priority_level: formData.priority_level,
                geocoding_confidence: formData.geocoding_confidence,
                weight_lbs: formData.weight_lbs ?? null
            }

            const { error } = await supabase.from('orders').update(updatedPayload).eq('id', effectiveOrderId)
            if (error) throw error

            // Update Local State & Close
            setOrder(prev => prev ? { ...prev, ...updatedPayload } as Order : null)
            setIsEditSheetOpen(false)
            toast({ title: "Changes Saved Successfully!", type: "success" })

        } catch (error: any) {
            toast({ title: "Failed to update order", description: friendlyError(error, 'Please check your connection and try again.'), type: "error" })
        } finally {
            setIsUpdating(false)
        }
    }

    function getMarkerColor(status: string) { const colors = { pending: '#eab308', assigned: '#3b82f6', in_progress: '#a855f7', delivered: '#22c55e', cancelled: '#ef4444' }; return colors[status as keyof typeof colors] || '#3b82f6' }

    function createColoredIcon(status: string) {
        if (typeof window === 'undefined') return undefined;
        const L = require('leaflet');
        return new L.divIcon({
            className: 'custom-marker',
            html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26c0-8.8-7.2-16-16-16z" fill="${getMarkerColor(status)}" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="white"/></svg>`,
            iconSize: [32, 42],
            iconAnchor: [16, 42],
            popupAnchor: [0, -42]
        })
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-4 safe-area-p">
                {/* Header Skeleton */}
                <div className="bg-white dark:bg-slate-900 p-4 shadow-sm space-y-2">
                    <div className="flex justify-between items-start">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-48" />
                </div>

                {/* Map Skeleton */}
                <div className="h-64 w-full bg-slate-200 dark:bg-slate-800 animate-pulse relative">
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-600">
                        <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                </div>

                {/* Timeline Skeleton */}
                <div className="p-4 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm space-y-4">
                        <Skeleton className="h-5 w-40" />
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex gap-4">
                                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                                <div className="space-y-2 flex-1">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-full" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Action Bar Skeleton */}
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-slate-900 border-t dark:border-slate-800 flex gap-2">
                        <Skeleton className="h-12 flex-1 rounded-xl" />
                        <Skeleton className="h-12 flex-1 rounded-xl" />
                    </div>
                </div>
            </div>
        )
    }
    if (!order) return <div className="p-4 flex flex-col items-center justify-center h-screen safe-area-p"><Package className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" /><p className="text-slate-500 dark:text-slate-400">Order not found</p><Button onClick={() => router.push('/orders')} className="mt-4">Back to Orders</Button></div>

    return (
        <PullToRefresh onRefresh={() => fetchOrder(false)}>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32">
                {/* Premium Header */}
                <div className="ios-header sticky top-0 z-10 safe-area-pt bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50">
                    <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-10 w-10 shrink-0 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 bg-white shadow-sm dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <ArrowLeft size={20} className="text-slate-700 dark:text-slate-300" />
                            </Button>
                            <div className="flex flex-col">
                                <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">#{order.order_number}</h1>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 line-clamp-1">{order.customer_name}</p>
                            </div>
                        </div>

                        {/* Status Pill */}
                        <div className={cn(
                            "px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border shadow-sm shrink-0 whitespace-nowrap",
                            order.status === 'pending' ? "bg-amber-50 text-amber-600 border-amber-200/50 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20" :
                                order.status === 'assigned' ? "bg-blue-50 text-blue-600 border-blue-200/50 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20" :
                                    order.status === 'in_progress' ? "bg-purple-50 text-purple-600 border-purple-200/50 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20" :
                                        order.status === 'delivered' ? "bg-emerald-50 text-emerald-600 border-emerald-200/50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" :
                                            "bg-rose-50 text-rose-600 border-rose-200/50 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                        )}>
                            {order.status.replace('_', ' ')}
                        </div>
                    </div>

                    {/* Persistent out-of-range banner — visible to ALL roles */}
                    {order.was_out_of_range && order.status === 'delivered' && (
                        <div className="mx-5 mt-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                            <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                Delivered out of range{order.delivery_distance_meters ? ` — ${Math.round(order.delivery_distance_meters * 3.281)} ft from destination` : ''}
                            </p>
                        </div>
                    )}
                </div>

                {/* Map Section */}
                {order.latitude && order.longitude && (
                    <div className="h-56 w-full relative border-b border-slate-200 dark:border-slate-800 overflow-hidden" style={{ zIndex: 0, isolation: 'isolate' }}>
                        <MapContainer center={[order.latitude, order.longitude]} zoom={15} style={{ height: '100%', width: '100%' }} className="z-0">
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                            <Marker position={[order.latitude, order.longitude]} icon={createColoredIcon(order.status)}><Popup>{order.customer_name}</Popup></Marker>
                        </MapContainer>
                    </div>
                )}

                {/* Content & Logic Area */}
                <div className="p-4 space-y-5 max-w-lg mx-auto">

                    {/* Customer Info Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-[28px] shadow-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden relative group">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-20 group-hover:opacity-40 transition-opacity"></div>
                        <div className="p-5 flex gap-4">
                            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-[16px] flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-inner">
                                <UserIcon size={24} strokeWidth={2.5} />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Customer Details</p>
                                <p className="text-lg font-black text-slate-900 dark:text-white truncate">{order.customer_name}</p>
                                {order.phone && (
                                    <a href={`tel:${order.phone}`} className="inline-flex items-center gap-1.5 mt-2 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-xl text-sm font-bold w-fit transition-colors group/phone">
                                        <Phone size={14} className="text-blue-500 group-hover/phone:rotate-12 transition-transform" /> {order.phone}
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tracking Link Card */}
                    {order.tracking_token && (
                        <div className="bg-white dark:bg-slate-900 rounded-[28px] shadow-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden relative group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-400 to-purple-500 opacity-20 group-hover:opacity-40 transition-opacity"></div>
                            <div className="p-5 flex gap-4">
                                <div className="w-12 h-12 bg-violet-50 dark:bg-violet-900/30 rounded-[16px] flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0 shadow-inner">
                                    <Link2 size={24} strokeWidth={2.5} />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Tracking Link</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate flex-1 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-xl">
                                            {typeof window !== 'undefined' ? `${window.location.origin}/track/${order.tracking_token}` : `/track/${order.tracking_token}`}
                                        </p>
                                        <button
                                            onClick={async () => {
                                                const url = `${window.location.origin}/track/${order.tracking_token}`
                                                await navigator.clipboard.writeText(url)
                                                setTrackingLinkCopied(true)
                                                setTimeout(() => setTrackingLinkCopied(false), 2000)
                                            }}
                                            className="inline-flex items-center gap-1.5 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
                                        >
                                            {trackingLinkCopied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Delivery Location Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-[28px] shadow-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden relative group">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-20 group-hover:opacity-40 transition-opacity"></div>
                        <div className="p-5 flex gap-4">
                            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-[16px] flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-inner">
                                <MapPin size={24} strokeWidth={2.5} />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Delivery Address</p>
                                <p className="text-base font-bold text-slate-800 dark:text-slate-200 leading-snug break-words">{order.address}</p>
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5">{[order.city, order.state].filter(Boolean).join(', ')}</p>

                                <button
                                    onClick={async () => {
                                        if (order.status === 'assigned' && !['manager', 'admin', 'company_admin'].includes(userRole || '')) {
                                            await updateOrderStatus('in_progress')
                                        }
                                        const isNative = Capacitor.isNativePlatform()
                                        if (isNative) {
                                            const url = Capacitor.getPlatform() === 'ios'
                                                ? `maps://?q=${order.latitude},${order.longitude}`
                                                : `geo:${order.latitude},${order.longitude}?q=${order.latitude},${order.longitude}`
                                            window.location.href = url
                                        } else {
                                            window.open(`https://www.google.com/maps/search/?api=1&query=${order.latitude},${order.longitude}`, '_blank')
                                        }
                                    }}
                                    className="mt-3 inline-flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-bold py-3 rounded-xl shadow-md transition-transform active:scale-[0.98]"
                                >
                                    <MapPin size={16} /> Open in Navigation
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Driver Notes Card */}
                    {order.notes && (
                        <div className="bg-amber-50/80 dark:bg-amber-950/20 rounded-[28px] border border-amber-200/60 dark:border-amber-900/40 p-5 mt-2 shadow-inner">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertCircle size={16} className="text-amber-600 dark:text-amber-500" />
                                <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-500">Important Notes</h3>
                            </div>
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 leading-relaxed italic bg-amber-100/50 dark:bg-amber-900/30 p-3 rounded-2xl">
                                "{order.notes}"
                            </p>
                        </div>
                    )}

                    {/* Proof Images Gallery - Only show when order is delivered */}
                    {order.status === 'delivered' && (proofImages.length > 0 || order.proof_url || order.signature_url) && (
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Proof of Delivery</p>
                                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full font-bold">
                                    {proofImages.length + (order.proof_url && proofImages.length === 0 ? 1 : 0)} {proofImages.length + (order.proof_url && proofImages.length === 0 ? 1 : 0) === 1 ? 'Photo' : 'Photos'}
                                </span>
                            </div>

                            <div className="flex gap-3 overflow-x-auto pb-2">
                                {/* Show new proof images from proof_images table */}
                                {proofImages.map((img) => (
                                    <div key={img.id} className="relative flex-shrink-0 w-40 h-32 rounded-lg overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 group">
                                        <img
                                            src={img.image_url}
                                            alt="Proof"
                                            className="object-cover w-full h-full cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => {
                                                setViewerImageUrl(img.image_url)
                                                setViewerImageTitle(`Proof of Delivery #${proofImages.indexOf(img) + 1}`)
                                            }}
                                        />

                                        {/* Delete Button - Only show if order is not delivered */}
                                        {order.status !== 'delivered' && !['manager', 'admin', 'company_admin'].includes(userRole || '') && (
                                            <button
                                                onClick={() => deleteProofImage(img.id, img.image_url)}
                                                className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label="Delete image"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}

                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                                    </div>
                                ))}

                                {/* Backward compatibility: Show legacy proof_url if no new images */}
                                {order.proof_url && proofImages.length === 0 && (
                                    <div className="relative flex-shrink-0 w-40 h-32 rounded-lg overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 group">
                                        <img
                                            src={order.proof_url}
                                            alt="Proof"
                                            className="object-cover w-full h-full cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => {
                                                setViewerImageUrl(order.proof_url!)
                                                setViewerImageTitle('Legacy Proof of Delivery')
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2">
                                            <p className="text-white text-[10px] font-medium">Legacy Image</p>
                                        </div>
                                    </div>
                                )}

                                {/* Signature Card */}
                                {order.signature_url && (
                                    <div className="relative flex-shrink-0 w-40 h-32 rounded-lg overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 group">
                                        <div className="absolute top-0 left-0 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 rounded-br border-b border-r border-slate-200 dark:border-slate-700 z-10">
                                            Signature
                                        </div>
                                        <img
                                            src={order.signature_url}
                                            alt="Signature"
                                            className="object-contain w-full h-full p-4 cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => {
                                                setViewerImageUrl(order.signature_url!)
                                                setViewerImageTitle('Customer Signature')
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 🚨 DRIVER ACTIONS (Show for anyone NOT a manager) */}
                {!['manager', 'admin', 'company_admin'].includes(userRole || '') && (
                    <div className="space-y-4 pt-2 block">
                        {order.status === 'delivered' ? (
                            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-[24px] border border-emerald-200/60 dark:border-emerald-900/40 p-6 text-center space-y-4 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400 shadow-inner">
                                    <CheckCircle2 size={32} strokeWidth={2.5} className="drop-shadow-sm" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-black text-emerald-800 dark:text-emerald-300 text-xl tracking-tight">Order Delivered!</h3>
                                    <p className="text-sm font-semibold text-emerald-600/80 dark:text-emerald-400/80">Time: {new Date(order.delivered_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>

                                {order.was_out_of_range && (
                                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-xl px-4 py-2.5 flex items-center gap-2">
                                        <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                            Delivered out of range{order.delivery_distance_meters ? ` (${Math.round(order.delivery_distance_meters * 3.281)} ft away)` : ''}
                                        </p>
                                    </div>
                                )}

                                {order.proof_url && (
                                    <div className="flex justify-center pt-2">
                                        <button
                                            onClick={() => {
                                                setViewerImageUrl(order.proof_url!)
                                                setViewerImageTitle('Proof of Delivery')
                                            }}
                                            className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-white/80 dark:bg-slate-900/80 border border-emerald-200/50 dark:border-emerald-800/50 px-5 py-2.5 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all shadow-sm active:scale-95"
                                        >
                                            <CameraIcon size={16} /> View Proof Photo
                                        </button>
                                    </div>
                                )}

                                <Button
                                    variant="outline"
                                    disabled={isUpdating}
                                    onClick={() => setIsUndoDialogOpen(true)}
                                    className="w-full h-12 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 mt-2 bg-transparent font-bold transition-all"
                                >
                                    {isUpdating ? <Loader2 className="animate-spin mr-2" size={18} /> : <Undo2 size={18} className="mr-2" />}
                                    Undo / Not Delivered
                                </Button>
                            </div>
                        ) : order.status === 'cancelled' ? (
                            <div className="bg-rose-50 dark:bg-rose-950/20 rounded-[24px] border border-rose-200/60 dark:border-rose-900/40 p-6 space-y-4 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-400 to-red-500 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/40 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0 shadow-inner">
                                        <AlertCircle size={28} strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-rose-800 dark:text-rose-300 text-xl tracking-tight">Order Cancelled</h3>
                                        {order.cancelled_at && (
                                            <p className="text-[13px] font-semibold text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                                                {new Date(order.cancelled_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(order.cancelled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {order.cancellation_reason && (
                                    <div className="bg-white/80 dark:bg-slate-900/60 rounded-2xl p-4 space-y-1.5 shadow-sm border border-rose-100 dark:border-rose-900/30">
                                        <p className="text-sm font-bold text-rose-800 dark:text-rose-300">
                                            Reason: <span className="font-semibold text-rose-600 dark:text-rose-400">{
                                                [...(MANAGER_CANCEL_REASONS || [])].find(r => r.value === order.cancellation_reason)?.label
                                                || order.cancellation_reason
                                            }</span>
                                        </p>
                                        {order.cancellation_note && (
                                            <p className="text-sm text-rose-600/90 dark:text-rose-400/90 italic font-medium leading-relaxed">&ldquo;{order.cancellation_note}&rdquo;</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {/* Start Delivery — prominent button for assigned orders */}
                                {order.status === 'assigned' && (
                                    <Button
                                        className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-[0_8px_16px_-6px_rgba(37,99,235,0.4)] text-[17px] font-black tracking-wide transition-all active:scale-[0.98] group flex items-center justify-center"
                                        disabled={isUpdating}
                                        onClick={async () => {
                                            await updateOrderStatus('in_progress')
                                            // Open maps navigation
                                            if (order.latitude && order.longitude) {
                                                const isNative = Capacitor.isNativePlatform()
                                                if (isNative) {
                                                    const url = Capacitor.getPlatform() === 'ios'
                                                        ? `maps://?q=${order.latitude},${order.longitude}`
                                                        : `geo:${order.latitude},${order.longitude}?q=${order.latitude},${order.longitude}`
                                                    window.location.href = url
                                                } else {
                                                    window.open(`https://www.google.com/maps/search/?api=1&query=${order.latitude},${order.longitude}`, '_blank')
                                                }
                                            }
                                        }}
                                    >
                                        {isUpdating ? <Loader2 className="animate-spin mr-2" size={22} /> : <Navigation size={22} className="mr-3 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />}
                                        Start Delivery
                                    </Button>
                                )}

                                {/* Button 1: Capture Proof */}
                                <Button
                                    variant="outline"
                                    disabled={isUploadingProof}
                                    onClick={async () => {
                                        try {
                                            setIsUploadingProof(true)
                                            const { Camera, CameraResultType } = await import('@capacitor/camera')
                                            const image = await Camera.getPhoto({
                                                quality: 70,
                                                allowEditing: false,
                                                resultType: CameraResultType.Uri
                                            })

                                            if (image.webPath) {
                                                const { ImageCompressor } = await import('@/lib/image-compressor')
                                                const response = await fetch(image.webPath)
                                                const originalBlob = await response.blob()
                                                const compressedBlob = await ImageCompressor.compressFromBlob(originalBlob)
                                                const filename = `proof-${orderId}-${Date.now()}.jpg`
                                                const { data, error } = await supabase.storage.from('proofs').upload(filename, compressedBlob)

                                                if (error) throw error

                                                if (data) {
                                                    const { data: { publicUrl } } = supabase.storage.from('proofs').getPublicUrl(filename)
                                                    const { data: { user } } = await supabase.auth.getUser()
                                                    const { data: userProfile } = await supabase.from('users').select('company_id').eq('id', user?.id).single()

                                                    const { data: newImage, error: insertError } = await supabase
                                                        .from('proof_images')
                                                        .insert({ order_id: orderId, company_id: userProfile?.company_id, image_url: publicUrl, uploaded_by: user?.id })
                                                        .select().single()

                                                    if (insertError) throw insertError

                                                    if (newImage) setProofImages(prev => [...prev, newImage])

                                                    toast({ title: 'Photo captured!', description: 'You can take more photos or mark as delivered', type: 'success' })
                                                }
                                            }
                                        } catch (e: any) {
                                            if (e.message !== 'User cancelled photos app') toast({ title: "Camera Failed", description: friendlyError(e, 'Could not access camera. Please check permissions.'), type: "error" })
                                        } finally {
                                            setIsUploadingProof(false)
                                        }
                                    }}
                                    className="w-full h-14 rounded-2xl border-2 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-all text-base bg-white dark:bg-slate-900"
                                >
                                    {isUploadingProof ? (
                                        <><Loader2 size={20} className="mr-2 animate-spin" /> Uploading...</>
                                    ) : (
                                        <><CameraIcon size={20} className="mr-2 text-slate-400" /> Capture Proof {proofImages.length > 0 && `(${proofImages.length})`}</>
                                    )}
                                </Button>

                                {/* ✍️ SIGNATURE (Optional/Required) */}
                                <div className="bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200/60 dark:border-slate-800 p-5 space-y-4 shadow-sm">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[13px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                            ✍️ Signature
                                            {formData.signature_required && <span className="text-red-500 font-bold text-[10px] ml-1">*REQ</span>}
                                        </label>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-3 text-xs font-bold rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            onClick={() => {
                                                setSignatureKey(prev => prev + 1)
                                                setSignatureData(null)
                                            }}
                                        >
                                            Clear
                                        </Button>
                                    </div>

                                    <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-[16px] bg-slate-50/50 dark:bg-slate-900/50 touch-none overflow-hidden hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                                        <SignatureInput
                                            key={signatureKey}
                                            onEnd={(dataUrl) => setSignatureData(dataUrl)}
                                        />
                                    </div>
                                    {formData.signature_required && !signatureData && (
                                        <p className="text-[11px] text-red-500 font-bold">Signature is required to complete delivery.</p>
                                    )}
                                </div>

                                {/* Button 2: Direct Delivery */}
                                <Button
                                    disabled={isUpdating || (formData.signature_required && !signatureData)}
                                    onClick={async () => {
                                        try {
                                            setIsUpdating(true)
                                            let finalSignatureUrl = null
                                            if (signatureData) {
                                                const blob = await (await fetch(signatureData)).blob()
                                                const filename = `sig-${orderId}-${Date.now()}.png`
                                                const { data, error } = await supabase.storage.from('proofs').upload(filename, blob)
                                                if (data) finalSignatureUrl = supabase.storage.from('proofs').getPublicUrl(filename).data.publicUrl
                                            }
                                            let proofUrl = proofImages[0]?.image_url || order.proof_url
                                            if (finalSignatureUrl) {
                                                const { error: sigErr } = await supabase.from('orders').update({ signature_url: finalSignatureUrl }).eq('id', orderId)
                                                if (sigErr) {
                                                    toast({ title: "Failed to save signature", description: friendlyError(sigErr), type: "error" })
                                                    return
                                                }
                                            }
                                            await updateOrderStatus('delivered', proofUrl)
                                        } catch (err: any) {
                                            toast({ title: "Error", description: friendlyError(err), type: "error" })
                                        } finally {
                                            setIsUpdating(false)
                                        }
                                    }}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white h-16 rounded-[20px] shadow-[0_8px_16px_-6px_rgba(16,185,129,0.4)] text-[17px] font-black tracking-wide transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none group"
                                >
                                    {isUpdating ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={24} className="group-hover:scale-110 transition-transform" />}
                                    <span>{isUpdating ? "Processing..." : "Complete Delivery"}</span>
                                </Button>

                                {/* Cancel Order — driver */}
                                <Button
                                    variant="outline"
                                    onClick={() => setIsCancelDialogOpen(true)}
                                    className="w-full h-14 rounded-2xl text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[15px] font-bold mt-2"
                                >
                                    <AlertCircle size={18} className="mr-2" /> Report Issue & Cancel
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* 🔒 MANAGER ACTIONS 🔒 */}
                {(userRole === 'manager' || userRole === 'admin' || userRole === 'company_admin') && (
                    <div className="space-y-4 pt-4 block">
                        {/* Status Update */}
                        <div className="bg-white dark:bg-slate-900 rounded-[28px] shadow-sm border border-slate-200/60 dark:border-slate-800 p-5 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-20 group-hover:opacity-40 transition-opacity"></div>
                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-3 pl-1">Update Status</label>
                            <div className="relative">
                                <select value={order.status} onChange={(e) => {
                                    if (e.target.value === 'cancelled') {
                                        setIsCancelDialogOpen(true)
                                    } else {
                                        updateOrderStatus(e.target.value)
                                    }
                                }} className="appearance-none w-full p-4 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl text-[15px] font-bold bg-slate-50/50 dark:bg-slate-900/50 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:ring-blue-400/10 dark:focus:border-blue-400 cursor-pointer shadow-sm">
                                    <option value="pending">🟡 Pending</option>
                                    <option value="assigned">🔵 Assigned</option>
                                    <option value="in_progress">🟣 In Progress</option>
                                    <option value="delivered">🟢 Delivered</option>
                                    <option value="cancelled">🔴 Cancelled</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 dark:text-slate-400">
                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                                </div>
                            </div>
                        </div>

                        {/* Assign Driver */}
                        <div className="bg-white dark:bg-slate-900 rounded-[28px] shadow-sm border border-slate-200/60 dark:border-slate-800 p-5 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400 to-pink-500 opacity-20 group-hover:opacity-40 transition-opacity"></div>
                            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-3 pl-1">Assign Driver</label>
                            <div className="relative">
                                <select
                                    value={order.driver_id || ''}
                                    onChange={async (e) => {
                                        const driverId = e.target.value || null
                                        const { error } = await supabase.from('orders').update({ driver_id: driverId, status: driverId ? 'assigned' : 'pending' }).eq('id', orderId)
                                        if (!error) fetchOrder()
                                    }}
                                    className="appearance-none w-full p-4 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl text-[15px] font-bold bg-slate-50/50 dark:bg-slate-900/50 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 dark:focus:ring-purple-400/10 dark:focus:border-purple-400 cursor-pointer shadow-sm"
                                >
                                    <option value="">👤 Unassigned</option>
                                    {drivers.map((driver) => (
                                        <option key={driver.id} value={driver.id} className={!isDriverOnline(driver) ? 'text-slate-400' : 'text-emerald-600 font-bold'}>
                                            {isDriverOnline(driver) ? '🟢' : '⚪'} {driver.name} {!isDriverOnline(driver) ? '(Offline)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 dark:text-slate-400">
                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pb-4">
                            <Button variant="outline" onClick={() => setIsEditSheetOpen(true)} className="h-14 rounded-2xl border-slate-200 dark:border-slate-800 text-[15px] font-bold shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800/50">
                                <Edit size={18} className="mr-2 text-slate-500" /> Edit Order
                            </Button>
                            <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)} className="h-14 rounded-2xl bg-rose-500 hover:bg-rose-600 text-[15px] font-bold shadow-sm">
                                <Trash2 size={18} className="mr-2" /> Delete
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Dialogs & Sheets */}
            <AlertDialog open={isUndoDialogOpen} onOpenChange={setIsUndoDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Undo Delivery?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will revert the status to <b>In Progress</b>. The delivery timestamp will be removed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                try {
                                    setIsUpdating(true)

                                    // Clear proof data from DB
                                    const { error: clearErr } = await supabase.from('orders').update({
                                        proof_url: null,
                                        signature_url: null
                                    }).eq('id', orderId)

                                    if (clearErr) {
                                        toast({ title: "Failed to clear proof data", description: friendlyError(clearErr), type: "error" })
                                        return
                                    }

                                    // Delete proof images from proof_images table
                                    if (proofImages.length > 0) {
                                        const { error: deleteErr } = await supabase.from('proof_images').delete().eq('order_id', orderId)
                                        if (deleteErr) {
                                            console.error('Failed to delete proof images:', deleteErr.message)
                                            // Continue — proof data already cleared, status update is more important
                                        }
                                        setProofImages([])
                                    }

                                    await updateOrderStatus('in_progress')

                                    // Update local state
                                    setOrder(prev => prev ? { ...prev, proof_url: null, signature_url: null } : prev)
                                } catch (err: any) {
                                    toast({ title: "Undo failed", description: friendlyError(err), type: "error" })
                                } finally {
                                    setIsUpdating(false)
                                    setIsUndoDialogOpen(false)
                                }
                            }}
                            className="bg-orange-500 hover:bg-orange-600"
                        >
                            Yes, Undo It
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Order?</AlertDialogTitle><AlertDialogDescription>Permanently remove #{order.order_number}?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-600">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

            {/* Cancel Order Dialog */}
            <AlertDialog open={isCancelDialogOpen} onOpenChange={(open) => {
                setIsCancelDialogOpen(open)
                if (!open) { setCancelReason(''); setCancelNote('') }
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                            <AlertCircle size={20} /> Cancel Order
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Select a reason for cancelling order <b>#{order.order_number}</b>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Reason Selection */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Reason *</label>
                            <select
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 dark:text-slate-100"
                            >
                                <option value="">Select a reason...</option>
                                {(['manager', 'admin', 'company_admin'].includes(userRole || '')
                                    ? MANAGER_CANCEL_REASONS
                                    : DRIVER_CANCEL_REASONS
                                ).map(r => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Note */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Note {cancelReason === 'other' ? '*' : '(optional)'}
                            </label>
                            <textarea
                                value={cancelNote}
                                onChange={(e) => setCancelNote(e.target.value)}
                                placeholder={cancelReason === 'other' ? 'Please provide details...' : 'Add additional details...'}
                                className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-900 dark:text-slate-100 min-h-[80px] resize-none"
                            />
                        </div>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>Go Back</AlertDialogCancel>
                        <button
                            onClick={handleCancelOrder}
                            disabled={!cancelReason || (cancelReason === 'other' && !cancelNote.trim()) || isUpdating}
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                        >
                            {isUpdating ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                            Confirm Cancellation
                        </button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Out-of-Range Confirmation Dialog */}
            <AlertDialog open={outOfRangeConfirm.show} onOpenChange={(open) => !open && setOutOfRangeConfirm({ show: false, distance: 0 })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
                            <AlertCircle size={20} /> Outside Delivery Zone
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm leading-relaxed">
                            You are <span className="font-bold text-amber-600 dark:text-amber-400">{Math.round(outOfRangeConfirm.distance * 3.281)} ft</span> away from the delivery address.
                            This delivery will be flagged as out of range. Are you sure you want to proceed?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setOutOfRangeConfirm({ show: false, distance: 0 })}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                setOutOfRangeConfirm({ show: false, distance: 0 })
                                await updateOrderStatus('delivered', outOfRangeConfirm.proofUrl, true)
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                            Deliver Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
                <SheetContent side="bottom" className="h-[90vh] overflow-y-auto safe-area-pt pb-36">
                    <SheetHeader>
                        <SheetTitle>Edit Order</SheetTitle>
                        <SheetDescription>Update order details and location.</SheetDescription>
                    </SheetHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4 mt-4 px-4 pb-12">
                        <Input value={formData.order_number || ''} onChange={e => setFormData(prev => ({ ...prev, order_number: e.target.value }))} placeholder="Order #" />
                        <Input value={formData.customer_name || ''} onChange={e => setFormData(prev => ({ ...prev, customer_name: e.target.value }))} placeholder="Customer Name" />

                        <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">GPS Location</h3>
                                {isGeocodingReversed && <div className="text-xs text-indigo-600 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Updating Address...</div>}
                            </div>
                            <LocationPicker
                                onLocationSelect={handlePinUpdate}
                                initialPosition={formData.latitude && formData.longitude ? { lat: formData.latitude, lng: formData.longitude } : undefined}
                            />
                            {formData.latitude != null && formData.longitude != null && <p className="text-xs text-blue-600 mt-2 font-mono">Pin: {formData.latitude.toFixed(5)}, {formData.longitude.toFixed(5)}</p>}
                        </div>

                        <Input value={formData.address || ''} onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))} placeholder="Address" />
                        <div className="grid grid-cols-2 gap-4">
                            <Input value={formData.city || ''} onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))} placeholder="City" />
                            <Input value={formData.state || ''} onChange={e => setFormData(prev => ({ ...prev, state: e.target.value }))} placeholder="State" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input value={formData.zip_code || ''} onChange={e => setFormData(prev => ({ ...prev, zip_code: e.target.value }))} placeholder="ZIP" />
                            <Input value={formData.phone || ''} onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))} placeholder="Phone" />
                        </div>
                        <Input value={formData.customer_email || ''} onChange={e => setFormData(prev => ({ ...prev, customer_email: e.target.value }))} type="email" placeholder="Customer Email" />
                        <Input value={formData.delivery_date ? new Date(formData.delivery_date).toISOString().split('T')[0] : ''} onChange={e => setFormData(prev => ({ ...prev, delivery_date: e.target.value }))} type="date" />
                        <textarea value={formData.notes || ''} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} className="w-full p-2 border rounded-md" placeholder="Notes" />
                        <Input value={formData.weight_lbs != null ? String(formData.weight_lbs) : ''} onChange={e => setFormData(prev => ({ ...prev, weight_lbs: e.target.value ? parseFloat(e.target.value) : null }))} type="number" step="0.1" min="0" placeholder="Weight (kg)" />

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Priority Level</label>
                            <div className="flex gap-2">
                                {['normal', 'high', 'critical'].map((level) => (
                                    <button
                                        key={level}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, priority_level: level as any }))}
                                        className={cn(
                                            "flex-1 py-2 px-3 rounded-lg border text-xs font-bold uppercase transition-all flex items-center justify-center gap-2",
                                            formData.priority_level === level
                                                ? (level === 'critical' ? "bg-red-500 text-white border-red-600" :
                                                    level === 'high' ? "bg-orange-500 text-white border-orange-600" :
                                                        "bg-blue-600 text-white border-blue-700")
                                                : "bg-card text-muted-foreground hover:bg-muted"
                                        )}
                                    >
                                        {level}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button type="submit" className="w-full" disabled={isUpdating}>{isUpdating ? "Saving..." : "Save Changes"}</Button>
                    </form>
                </SheetContent>
            </Sheet>

            {/* DRIVER TRACKER - Only if user is a driver */}
            {userRole === 'driver' && currentDriverId && (
                <DriverTracker
                    driverId={currentDriverId}
                    companyId={currentCompanyId || undefined}
                    isOnline={true}
                    userId={currentUserId || undefined}
                />
            )}

            {/* Image Viewer Modal */}
            <ImageViewerModal
                imageUrl={viewerImageUrl}
                onClose={() => setViewerImageUrl(null)}
                title={viewerImageTitle}
            />

        </PullToRefresh>
    )
}
