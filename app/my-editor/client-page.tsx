"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, MapPin, Calendar, User as UserIcon, Phone, Package, Edit, Trash2, Clock, Undo2, CheckCircle2, Loader2, Camera as CameraIcon, X, Navigation, AlertCircle } from "lucide-react"
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
import LocationPicker from "@/components/location-picker"
import { DebugLocationStatus } from "@/components/debug-location-status"
import { DriverTracker } from "@/components/driver-tracker"
import { ImageViewerModal } from "@/components/image-viewer-modal"
import { Capacitor } from '@capacitor/core'
import { PullToRefresh } from '@/components/pull-to-refresh'

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
                delivery_date: order.delivery_date,
                notes: order.notes,
                latitude: order.latitude,
                longitude: order.longitude,
                priority_level: order.priority_level || 'normal',
                geocoding_confidence: order.geocoding_confidence
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
            toast({ title: 'Error fetching order', description: error.message, type: 'error' })
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

    async function updateOrderStatus(newStatus: string, proofUrl?: string | null) {
        if (!order || !orderId) return
        try {
            let locationPayload = null
            let isOutOfRange = false
            let dist = 0

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

                    // Flag if > 500 meters (approx 0.3 miles)
                    if (dist > 500) {
                        isOutOfRange = true
                        toast({ title: "⚠️ Out of Range", description: `You are ${Math.round(dist)}m away from the delivery location. This delivery has been flagged.`, type: "error" })
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
                    delivered_at: new Date().toISOString()
                }).eq('id', orderId)
            } else {
                // Fallback if offline manager handles it, but we do it explicitly here for safety
                // (Note: offlineManager implementation details might conflict, but explicit update is safer for MVP)
                await supabase.from('orders').update({
                    status: newStatus,
                    delivered_at: newStatus === 'delivered' ? new Date().toISOString() : null
                }).eq('id', orderId)
            }

            // Optimistic Update
            setOrder(prev => prev ? {
                ...prev,
                status: newStatus as any,
                delivered_at: newStatus === 'delivered' ? new Date().toISOString() : prev.delivered_at,
                // proof_url: proofUrl // Add to type if needed
            } : null)

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
            toast({ title: 'Could not auto-fill address', description: error.message || "Unknown error", type: 'error' })
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
            toast({ title: 'Failed to delete image', description: error.message, type: 'error' })
        }
    }

    async function handleDelete() {
        if (!orderId) return
        try { setIsDeleting(true); const { error } = await supabase.from('orders').delete().eq('id', orderId); if (error) throw error; router.push('/orders') } catch (error: any) { toast({ title: 'Delete Failed', description: error.message, type: 'error' }) } finally { setIsDeleting(false) }
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
                delivery_date: formData.delivery_date,
                notes: formData.notes,
                latitude: finalLat,
                longitude: finalLng,
                priority_level: formData.priority_level,
                geocoding_confidence: formData.geocoding_confidence
            }

            const { error } = await supabase.from('orders').update(updatedPayload).eq('id', effectiveOrderId)
            if (error) throw error

            // Update Local State & Close
            setOrder(prev => prev ? { ...prev, ...updatedPayload } as Order : null)
            setIsEditSheetOpen(false)
            toast({ title: "Changes Saved Successfully!", type: "success" })

        } catch (error: any) {
            toast({ title: "Failed to update order", description: error.message || 'Check connection', type: "error" })
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
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-4">
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
    if (!order) return <div className="p-4 flex flex-col items-center justify-center h-screen"><Package className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" /><p className="text-slate-500 dark:text-slate-400">Order not found</p><Button onClick={() => router.push('/orders')} className="mt-4">Back to Orders</Button></div>

    return (
        <PullToRefresh onRefresh={() => fetchOrder(false)}>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-4">
            {/* Header */}
            <div className="ios-header sticky top-0 z-10 safe-area-pt">
                <div className="p-4 flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-9 w-9 p-0 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft size={20} /></Button>
                    <div className="flex-1"><h1 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">#{order.order_number}</h1><p className="text-xs text-slate-500 dark:text-slate-400">{order.customer_name}</p></div>
                    <span className={`px-3 py-1 text-xs font-bold rounded-full border uppercase tracking-wider ${statusColors[order.status as keyof typeof statusColors]}`}>{order.status.replace("_", " ")}</span>
                </div>
            </div>

            {/* Map Section */}
            {order.latitude && order.longitude && (
                <div className="h-56 w-full relative border-b border-slate-200 dark:border-slate-800">
                    <MapContainer center={[order.latitude, order.longitude]} zoom={15} style={{ height: '100%', width: '100%' }} className="z-0">
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                        <Marker position={[order.latitude, order.longitude]} icon={createColoredIcon(order.status)}><Popup>{order.customer_name}</Popup></Marker>
                    </MapContainer>
                </div>
            )}

            {/* Content & Logic Area */}
            <div className="p-4 space-y-4 max-w-lg mx-auto">

                {/* Info Cards */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden divide-y divide-slate-50 dark:divide-slate-800">
                    <div className="p-4 flex gap-4"><div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0"><UserIcon size={20} /></div><div><p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Customer</p><p className="font-medium text-slate-900 dark:text-slate-100">{order.customer_name}</p>{order.phone && (<a href={`tel:${order.phone}`} className="text-blue-600 dark:text-blue-400 text-sm font-medium flex items-center gap-1 mt-1"><Phone size={12} /> {order.phone}</a>)}</div></div>
                    <div className="p-4 flex gap-4"><div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0"><MapPin size={20} /></div><div><p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Address</p><p className="font-medium text-slate-900 dark:text-slate-100">{order.address}</p><p className="text-sm text-slate-500 dark:text-slate-400">{[order.city, order.state].filter(Boolean).join(', ')}</p><button
                        onClick={async () => {
                            // Auto-trigger in_progress when driver navigates from assigned order
                            if (order.status === 'assigned' && !['manager', 'admin', 'company_admin'].includes(userRole || '')) {
                                await updateOrderStatus('in_progress')
                            }
                            const isNative = Capacitor.isNativePlatform()
                            if (isNative) {
                                // Open native Maps app
                                const url = Capacitor.getPlatform() === 'ios'
                                    ? `maps://?q=${order.latitude},${order.longitude}`
                                    : `geo:${order.latitude},${order.longitude}?q=${order.latitude},${order.longitude}`
                                window.location.href = url
                            } else {
                                // Web: open in new tab
                                window.open(`https://www.google.com/maps/search/?api=1&query=${order.latitude},${order.longitude}`, '_blank')
                            }
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full mt-2 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                    >
                        Open in Google Maps
                    </button></div></div>
                    {order.notes && (<div className="p-4 bg-yellow-50/50 dark:bg-yellow-950/20"><p className="text-xs text-yellow-600 dark:text-yellow-400 font-bold uppercase tracking-wider mb-1">Driver Notes</p><p className="text-sm text-slate-700 dark:text-slate-300 italic">"{order.notes}"</p></div>)}

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
                    <div className="space-y-3 pt-2">
                        {order.status === 'delivered' ? (
                            <div className="bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-900/50 p-5 text-center space-y-3 animate-in fade-in slide-in-from-bottom-4">
                                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400"><CheckCircle2 size={24} /></div>
                                <div><h3 className="font-bold text-green-800 dark:text-green-300 text-lg">Order Delivered!</h3><p className="text-sm text-green-700 dark:text-green-400">Time: {new Date(order.delivered_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>

                                {order.proof_url && (
                                    <div className="flex justify-center">
                                        <button
                                            onClick={() => {
                                                setViewerImageUrl(order.proof_url!)
                                                setViewerImageTitle('Proof of Delivery')
                                            }}
                                            className="inline-flex items-center gap-2 text-xs font-bold text-green-700 dark:text-green-400 bg-white dark:bg-slate-900 border border-green-200 dark:border-green-800 px-4 py-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors shadow-sm"
                                        >
                                            <CameraIcon size={14} /> View Proof Photo
                                        </button>
                                    </div>
                                )}



                                <Button
                                    variant="outline"
                                    disabled={isUpdating}
                                    onClick={() => setIsUndoDialogOpen(true)}
                                    className="w-full h-12 border-green-200 text-green-700 hover:bg-green-100 mt-2 bg-transparent font-medium"
                                >
                                    {isUpdating ? <Loader2 className="animate-spin mr-2" size={18} /> : <Undo2 size={18} className="mr-2" />}
                                    Undo / Not Delivered
                                </Button>
                            </div>
                        ) : order.status === 'cancelled' ? (
                            <div className="bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-900/50 p-5 space-y-3 animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 flex-shrink-0">
                                        <AlertCircle size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-red-800 dark:text-red-300 text-lg">Order Cancelled</h3>
                                        {order.cancelled_at && (
                                            <p className="text-sm text-red-600 dark:text-red-400">
                                                {new Date(order.cancelled_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(order.cancelled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {order.cancellation_reason && (
                                    <div className="bg-white/60 dark:bg-slate-900/40 rounded-lg p-3 space-y-1">
                                        <p className="text-sm font-medium text-red-700 dark:text-red-300">
                                            Reason: {
                                                [...(MANAGER_CANCEL_REASONS || [])].find(r => r.value === order.cancellation_reason)?.label
                                                || order.cancellation_reason
                                            }
                                        </p>
                                        {order.cancellation_note && (
                                            <p className="text-sm text-red-600 dark:text-red-400 italic">&ldquo;{order.cancellation_note}&rdquo;</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {/* Start Delivery — prominent button for assigned orders */}
                                {order.status === 'assigned' && (
                                    <Button
                                        className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white text-base font-bold shadow-lg"
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
                                        {isUpdating ? <Loader2 className="animate-spin mr-2" size={20} /> : <Navigation size={20} className="mr-2" />}
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
                                                // Import compression utility
                                                const { ImageCompressor } = await import('@/lib/image-compressor')

                                                // Fetch and compress image
                                                const response = await fetch(image.webPath)
                                                const originalBlob = await response.blob()
                                                const compressedBlob = await ImageCompressor.compressFromBlob(originalBlob)

                                                const filename = `proof-${orderId}-${Date.now()}.jpg`

                                                // Upload compressed version (96% smaller)
                                                const { data, error } = await supabase.storage
                                                    .from('proofs')
                                                    .upload(filename, compressedBlob)

                                                if (error) throw error

                                                if (data) {
                                                    const { data: { publicUrl } } = supabase.storage.from('proofs').getPublicUrl(filename)

                                                    // Get company_id and user_id
                                                    const { data: { user } } = await supabase.auth.getUser()
                                                    const { data: userProfile } = await supabase
                                                        .from('users')
                                                        .select('company_id')
                                                        .eq('id', user?.id)
                                                        .single()

                                                    // Save to proof_images table
                                                    const { data: newImage, error: insertError } = await supabase
                                                        .from('proof_images')
                                                        .insert({
                                                            order_id: orderId,
                                                            company_id: userProfile?.company_id,
                                                            image_url: publicUrl,
                                                            uploaded_by: user?.id
                                                        })
                                                        .select()
                                                        .single()

                                                    if (insertError) throw insertError

                                                    // Update local state
                                                    if (newImage) {
                                                        setProofImages(prev => [...prev, newImage])
                                                    }

                                                    toast({ title: 'Photo captured!', description: 'You can take more photos or mark as delivered', type: 'success' })
                                                }
                                            }
                                        } catch (e: any) {
                                            // Ensure user knows why it failed
                                            if (e.message !== 'User cancelled photos app') {
                                                toast({ title: "Camera Failed", description: e.message, type: "error" })
                                            }
                                        } finally {
                                            setIsUploadingProof(false)
                                        }
                                    }}
                                    className="w-full h-12 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
                                >
                                    {isUploadingProof ? (
                                        <>
                                            <Loader2 size={18} className="mr-2 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <CameraIcon size={18} className="mr-2" />
                                            Capture Proof {proofImages.length > 0 && `(${proofImages.length})`}
                                        </>
                                    )}
                                </Button>

                                {/* ✍️ SIGNATURE (Optional/Required) */}
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                            ✍️ Customer Signature
                                            {formData.signature_required && <span className="text-red-500 text-xs">*Required</span>}
                                        </label>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            onClick={() => {
                                                // clear signature
                                                const canvas = document.querySelector('canvas.sig-canvas') as HTMLCanvasElement
                                                // We need a ref to clear it properly, or just remount.
                                                // The simplest way without complex refs across dynamic imports is to use the clear button provided by the lib wrapper or expose a clear method.
                                                // For now, I will assume the SignatureInput component handles 'value' prop and clearing.
                                                // Actually, I'll implement a 'key' prop to force re-render to clear.
                                                setSignatureKey(prev => prev + 1)
                                                setSignatureData(null)
                                            }}
                                        >
                                            Clear
                                        </Button>
                                    </div>

                                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 touch-none">
                                        <SignatureInput
                                            key={signatureKey}
                                            onEnd={(dataUrl) => setSignatureData(dataUrl)}
                                        />
                                    </div>
                                    {formData.signature_required && !signatureData && (
                                        <p className="text-[10px] text-red-500 font-bold">Signature is required to complete delivery.</p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-3">
                                    {/* Button 2: Direct Delivery */}
                                    <Button
                                        disabled={isUpdating || (formData.signature_required && !signatureData)}
                                        onClick={async () => {
                                            // Check if at least one proof image exists (if no signature)
                                            // If signature required, we checked above.

                                            // Combine uploads
                                            try {
                                                setIsUpdating(true)

                                                let finalSignatureUrl = null
                                                if (signatureData) {
                                                    // Upload Signature
                                                    const blob = await (await fetch(signatureData)).blob()
                                                    const filename = `sig-${orderId}-${Date.now()}.png`
                                                    const { data, error } = await supabase.storage.from('proofs').upload(filename, blob)
                                                    if (data) {
                                                        const { data: { publicUrl } } = supabase.storage.from('proofs').getPublicUrl(filename)
                                                        finalSignatureUrl = publicUrl
                                                    }
                                                }

                                                // Use first proof image URL or fallback to legacy proof_url
                                                let proofUrl = proofImages[0]?.image_url || order.proof_url

                                                // Update status with signature
                                                if (finalSignatureUrl) {
                                                    await supabase.from('orders').update({ signature_url: finalSignatureUrl }).eq('id', orderId)
                                                }

                                                // Mark Delivered
                                                await updateOrderStatus('delivered', proofUrl)

                                            } catch (err: any) {
                                                toast({ title: "Error", description: err.message, type: "error" })
                                            } finally {
                                                setIsUpdating(false)
                                            }
                                        }}
                                        className="w-full bg-green-600 hover:bg-green-700 text-white h-14 rounded-xl shadow-lg shadow-green-200 text-lg font-bold transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        {isUpdating ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={24} />}
                                        <span>{isUpdating ? "Processing..." : "Mark Delivered"}</span>
                                    </Button>
                                </div>

                                {/* Cancel Order — driver */}
                                <Button
                                    variant="outline"
                                    onClick={() => setIsCancelDialogOpen(true)}
                                    className="w-full h-12 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium"
                                >
                                    <AlertCircle size={16} className="mr-2" /> Cancel Order
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* 🔒 MANAGER ACTIONS 🔒 */}
                {(userRole === 'manager' || userRole === 'admin' || userRole === 'company_admin') && (
                    <div className="space-y-4 pt-4">
                        {/* Status Update */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-4">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">Update Status</label>
                            <select value={order.status} onChange={(e) => {
                                if (e.target.value === 'cancelled') {
                                    setIsCancelDialogOpen(true)
                                } else {
                                    updateOrderStatus(e.target.value)
                                }
                            }} className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium bg-slate-50 dark:bg-slate-900 dark:text-slate-100">
                                <option value="pending">🟡 Pending</option>
                                <option value="assigned">🔵 Assigned</option>
                                <option value="in_progress">🟣 In Progress</option>
                                <option value="delivered">🟢 Delivered</option>
                                <option value="cancelled">🔴 Cancelled</option>
                            </select>
                        </div>

                        {/* Assign Driver With ONLINE Status */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 p-4">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">Assign Driver</label>
                            <select
                                value={order.driver_id || ''}
                                onChange={async (e) => {
                                    const driverId = e.target.value || null
                                    const { error } = await supabase.from('orders').update({ driver_id: driverId, status: driverId ? 'assigned' : 'pending' }).eq('id', orderId)
                                    if (!error) fetchOrder()
                                }}
                                className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium bg-slate-50 dark:bg-slate-900 dark:text-slate-100"
                            >
                                <option value="">Unassigned</option>
                                {drivers.map((driver) => (
                                    <option key={driver.id} value={driver.id} className={!isDriverOnline(driver) ? 'text-slate-400' : 'text-green-700 font-bold'}>
                                        {isDriverOnline(driver) ? '🟢' : '⚪'} {driver.name} {!isDriverOnline(driver) ? '(Offline)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <Button variant="outline" onClick={() => setIsEditSheetOpen(true)} className="w-full"><Edit size={16} className="mr-2" /> Edit</Button>
                            <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)} className="w-full"><Trash2 size={16} className="mr-2" /> Delete</Button>
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
                                    await supabase.from('orders').update({
                                        proof_url: null,
                                        signature_url: null
                                    }).eq('id', orderId)

                                    // Delete proof images from proof_images table
                                    if (proofImages.length > 0) {
                                        await supabase.from('proof_images').delete().eq('order_id', orderId)
                                        setProofImages([])
                                    }

                                    await updateOrderStatus('in_progress')

                                    // Update local state
                                    setOrder(prev => prev ? { ...prev, proof_url: null, signature_url: null } : prev)
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

            <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
                <SheetContent side="bottom" className="h-[90vh] overflow-y-auto safe-area-pt">
                    <SheetHeader>
                        <SheetTitle>Edit Order</SheetTitle>
                        <SheetDescription>Update order details and location.</SheetDescription>
                    </SheetHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
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
                        <Input value={formData.delivery_date ? new Date(formData.delivery_date).toISOString().split('T')[0] : ''} onChange={e => setFormData(prev => ({ ...prev, delivery_date: e.target.value }))} type="date" />
                        <textarea value={formData.notes || ''} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} className="w-full p-2 border rounded-md" placeholder="Notes" />

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

            <DebugLocationStatus />
        </div >
        </PullToRefresh>
    )
}
