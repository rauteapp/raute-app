'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import "leaflet/dist/leaflet.css"

// Dynamic Leaflet imports (no SSR)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })

// Create a standalone anon Supabase client for public tracking (no auth needed)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
})

type OrderData = {
    id: string
    order_number: string
    customer_name: string
    address: string
    city: string | null
    state: string | null
    status: 'pending' | 'assigned' | 'in_progress' | 'delivered'
    driver_id: string | null
    driver_name: string | null
    driver_current_lat: number | null
    driver_current_lng: number | null
    driver_last_location_update: string | null
    latitude: number | null
    longitude: number | null
    time_window_start: string | null
    time_window_end: string | null
    delivered_at: string | null
    route_index: number | null
    delivery_date: string | null
}

const STATUSES = ['pending', 'assigned', 'in_progress', 'delivered'] as const
type Status = typeof STATUSES[number]

const STATUS_CONFIG: Record<Status, { label: string; color: string; bgColor: string; ringColor: string }> = {
    pending: { label: 'Pending', color: 'text-yellow-600', bgColor: 'bg-yellow-500', ringColor: 'ring-yellow-500' },
    assigned: { label: 'Assigned', color: 'text-blue-600', bgColor: 'bg-blue-500', ringColor: 'ring-blue-500' },
    in_progress: { label: 'In Progress', color: 'text-purple-600', bgColor: 'bg-purple-500', ringColor: 'ring-purple-500' },
    delivered: { label: 'Delivered', color: 'text-green-600', bgColor: 'bg-green-500', ringColor: 'ring-green-500' },
}

function getStatusIndex(status: Status): number {
    return STATUSES.indexOf(status)
}

function getDriverFirstName(fullName: string | null): string {
    if (!fullName) return 'Driver'
    return fullName.split(' ')[0]
}

function estimateETA(
    driverLat: number | null,
    driverLng: number | null,
    destLat: number | null,
    destLng: number | null
): number | null {
    if (!driverLat || !driverLng || !destLat || !destLng) return null
    // Haversine distance in miles
    const R = 3959 // Earth radius in miles
    const dLat = ((destLat - driverLat) * Math.PI) / 180
    const dLng = ((destLng - driverLng) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((driverLat * Math.PI) / 180) *
        Math.cos((destLat * Math.PI) / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distanceMiles = R * c
    // Simple ETA: distance / 25 mph * 60 min
    return Math.round((distanceMiles / 25) * 60)
}

function formatTime(timeStr: string | null): string {
    if (!timeStr) return ''
    // HH:MM:SS -> 12h format
    const [h, m] = timeStr.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatTimestamp(ts: string | null): string {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    })
}

// Fix default Leaflet marker icons in Next.js
function useLeafletIcons() {
    useEffect(() => {
        if (typeof window === 'undefined') return
        const L = require('leaflet')
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        })
    }, [])
}

export default function TrackingPage() {
    const params = useParams()
    const token = params.token as string

    const [order, setOrder] = useState<OrderData | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)

    useLeafletIcons()

    const fetchOrder = useCallback(async () => {
        const { data, error } = await supabase.rpc('get_order_by_tracking_token', { token })
        if (error || !data) {
            setNotFound(true)
            setLoading(false)
            return
        }
        setOrder(data as OrderData)
        setLoading(false)
    }, [token])

    // Initial fetch
    useEffect(() => {
        fetchOrder()
    }, [fetchOrder])

    // Poll every 10s for driver location updates
    useEffect(() => {
        if (!order || order.status === 'delivered') return
        const interval = setInterval(fetchOrder, 10000)
        return () => clearInterval(interval)
    }, [order?.status, fetchOrder])

    const currentStatusIndex = order ? getStatusIndex(order.status) : -1

    const eta = useMemo(() => {
        if (!order || order.status !== 'in_progress') return null
        return estimateETA(
            order.driver_current_lat,
            order.driver_current_lng,
            order.latitude,
            order.longitude
        )
    }, [order])

    const showMap = order && order.latitude && order.longitude
    const showDriverMarker = order?.status === 'in_progress' && order.driver_current_lat && order.driver_current_lng

    // Custom driver marker icon
    const driverIcon = useMemo(() => {
        if (typeof window === 'undefined') return undefined
        const L = require('leaflet')
        return new L.DivIcon({
            html: `<div style="background:#7c3aed;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
            </div>`,
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
        })
    }, [])

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-gray-200 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-500 text-sm">Loading tracking info...</p>
                </div>
            </div>
        )
    }

    // Not found
    if (notFound || !order) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">Order not found</h1>
                    <p className="text-gray-500 text-sm">This tracking link is invalid or has expired. Please check the link and try again.</p>
                </div>
            </div>
        )
    }

    const isDelivered = order.status === 'delivered'
    const fullAddress = [order.address, order.city, order.state].filter(Boolean).join(', ')

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-2xl mx-auto px-4 py-5">
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Delivery Tracking</p>
                    <h1 className="text-lg font-semibold text-gray-900">Order #{order.order_number}</h1>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
                {/* Delivered banner */}
                {isDelivered && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-semibold text-green-800">Delivered</p>
                            {order.delivered_at && (
                                <p className="text-sm text-green-600">{formatTimestamp(order.delivered_at)}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* ETA card */}
                {!isDelivered && eta !== null && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-semibold text-purple-800">Estimated arrival</p>
                            <p className="text-sm text-purple-600">
                                {eta < 1 ? 'Arriving now' : eta === 1 ? '~1 minute' : `~${eta} minutes`}
                            </p>
                        </div>
                    </div>
                )}

                {/* Status stepper */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-5">Status</h2>
                    <div className="relative">
                        {STATUSES.map((status, idx) => {
                            const config = STATUS_CONFIG[status]
                            const isActive = idx <= currentStatusIndex
                            const isCurrent = idx === currentStatusIndex
                            const isLast = idx === STATUSES.length - 1

                            return (
                                <div key={status} className="flex items-start gap-4 relative">
                                    {/* Vertical connector line */}
                                    {!isLast && (
                                        <div
                                            className={`absolute left-[15px] top-[30px] w-0.5 h-[calc(100%-6px)] ${
                                                idx < currentStatusIndex ? 'bg-green-300' : 'bg-gray-200'
                                            }`}
                                        />
                                    )}
                                    {/* Circle */}
                                    <div className="relative z-10 flex-shrink-0">
                                        <div
                                            className={`w-[30px] h-[30px] rounded-full flex items-center justify-center border-2 transition-all ${
                                                isCurrent
                                                    ? `${config.bgColor} border-transparent ring-4 ${config.ringColor}/20`
                                                    : isActive
                                                    ? 'bg-green-500 border-transparent'
                                                    : 'bg-white border-gray-300'
                                            }`}
                                        >
                                            {isActive && (
                                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                    {/* Label */}
                                    <div className={`pb-7 ${isLast ? 'pb-0' : ''}`}>
                                        <p className={`text-sm font-medium ${isCurrent ? config.color : isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                                            {config.label}
                                        </p>
                                        {isCurrent && status === 'in_progress' && order.driver_name && (
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {getDriverFirstName(order.driver_name)} is on the way
                                            </p>
                                        )}
                                        {isCurrent && status === 'assigned' && order.driver_name && (
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                Assigned to {getDriverFirstName(order.driver_name)}
                                            </p>
                                        )}
                                        {status === 'delivered' && isDelivered && order.delivered_at && (
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {formatTimestamp(order.delivered_at)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Delivery details */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                    <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Delivery Details</h2>

                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-medium">Delivery Address</p>
                            <p className="text-sm text-gray-900">{fullAddress}</p>
                        </div>
                    </div>

                    {(order.time_window_start || order.time_window_end) && (
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 font-medium">Time Window</p>
                                <p className="text-sm text-gray-900">
                                    {order.time_window_start && order.time_window_end
                                        ? `${formatTime(order.time_window_start)} - ${formatTime(order.time_window_end)}`
                                        : order.time_window_start
                                        ? `After ${formatTime(order.time_window_start)}`
                                        : `Before ${formatTime(order.time_window_end)}`}
                                </p>
                            </div>
                        </div>
                    )}

                    {order.driver_name && (
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 font-medium">Driver</p>
                                <p className="text-sm text-gray-900">{getDriverFirstName(order.driver_name)}</p>
                            </div>
                        </div>
                    )}

                    {order.delivery_date && (
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 font-medium">Delivery Date</p>
                                <p className="text-sm text-gray-900">
                                    {new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                    })}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Map */}
                {showMap && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-4 pb-2">
                            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Map</h2>
                        </div>
                        <div className="h-[300px] sm:h-[350px]">
                            <MapContainer
                                center={[order.latitude!, order.longitude!]}
                                zoom={showDriverMarker ? 12 : 14}
                                style={{ height: '100%', width: '100%' }}
                                zoomControl={false}
                                attributionControl={false}
                            >
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                {/* Destination marker */}
                                <Marker position={[order.latitude!, order.longitude!]}>
                                    <Popup>
                                        <span className="text-sm font-medium">Delivery Location</span><br />
                                        <span className="text-xs text-gray-500">{fullAddress}</span>
                                    </Popup>
                                </Marker>
                                {/* Driver marker */}
                                {showDriverMarker && driverIcon && (
                                    <Marker
                                        position={[order.driver_current_lat!, order.driver_current_lng!]}
                                        icon={driverIcon}
                                    >
                                        <Popup>
                                            <span className="text-sm font-medium">{getDriverFirstName(order.driver_name)}</span><br />
                                            <span className="text-xs text-gray-500">
                                                {order.driver_last_location_update
                                                    ? `Updated ${formatTimestamp(order.driver_last_location_update)}`
                                                    : 'Current location'}
                                            </span>
                                        </Popup>
                                    </Marker>
                                )}
                            </MapContainer>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="text-center pb-6 pt-2">
                    <p className="text-xs text-gray-400">Powered by Raute</p>
                </div>
            </div>
        </div>
    )
}
