"use client"

import { useEffect, useState, useMemo } from "react"
import dynamic from "next/dynamic"
import "leaflet/dist/leaflet.css"
import { MapPin, Package, Truck, User, Trash2 } from "lucide-react"
import { supabase, type Order, type Driver } from "@/lib/supabase"
import { isDriverOnline } from "@/lib/driver-status"
import * as L from "leaflet" // Import Leaflet directly
import { useTheme } from "next-themes"
import { Capacitor } from "@capacitor/core"
import type { MapControllerProps } from "@/components/map/map-controller"

const CachedTileLayer = dynamic(
    () => import("@/components/map/cached-tile-layer"),
    { ssr: false }
)

// Dynamic Leaflet Components
const MapContainer = dynamic(
    () => import("react-leaflet").then((mod) => mod.MapContainer),
    { ssr: false }
)
const Marker = dynamic(
    () => import("react-leaflet").then((mod) => mod.Marker),
    { ssr: false }
)
const Popup = dynamic(
    () => import("react-leaflet").then((mod) => mod.Popup),
    { ssr: false }
)
const Polyline = dynamic(
    () => import("react-leaflet").then((mod) => mod.Polyline),
    { ssr: false }
)

const MapController = dynamic<MapControllerProps>(
    () => import("@/components/map/map-controller"),
    { ssr: false }
)

const AnimatedMarker = dynamic(
    () => import("@/components/map/animated-marker"),
    { ssr: false }
)

// -- Icon Generators --
const createOrderIcon = (status: string, index?: number) => {
    const colors = {
        pending: '#eab308',
        assigned: '#3b82f6',
        in_progress: '#a855f7',
        delivered: '#22c55e',
        cancelled: '#ef4444',
    }
    const color = colors[status as keyof typeof colors] || '#3b82f6'

    if (index !== undefined) {
        return L.divIcon({
            className: 'custom-marker',
            html: `
                <div style="
                    background-color: ${color}; 
                    color: white; 
                    width: 32px; 
                    height: 32px; 
                    border-radius: 50%; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-weight: 900; 
                    font-family: ui-sans-serif, system-ui, sans-serif;
                    font-size: 14px;
                    border: 3px solid white; 
                    box-shadow: 0 8px 16px -4px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.05);
                    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                " class="hover:scale-110">
                    ${index}
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16]
        })
    }

    return L.divIcon({
        className: 'custom-marker hover:scale-110 transition-transform duration-200',
        html: `
            <svg width="36" height="46" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 8px 12px rgba(0,0,0,0.25));">
                <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26c0-8.8-7.2-16-16-16z" 
                      fill="${color}" stroke="white" stroke-width="2.5"/>
                <circle cx="16" cy="16" r="6" fill="white" style="opacity: 0.95; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);"/>
            </svg>`,
        iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -46]
    })
}

const createDriverIcon = (isOnline: boolean) => {
    return L.divIcon({
        className: 'driver-marker hover:scale-110 transition-transform duration-300',
        html: `
            <div style="
                background: ${isOnline ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #64748b 0%, #475569 100%)'};
                width: 44px; height: 44px; 
                border-radius: 50%; 
                display: flex; align-items: center; justify-content: center; 
                border: 3px solid white; 
                box-shadow: 0 10px 20px -5px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.05);
                position: relative;
            ">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
                    <path d="M15 18H9"/>
                    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
                    <circle cx="17" cy="18" r="2"/>
                    <circle cx="7" cy="18" r="2"/>
                </svg>
                ${isOnline ? '<div style="position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; background-color: #34d399; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 8px rgba(16,185,129,0.8);"></div>' : ''}
            </div>`,
        iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -24]
    })
}


interface InteractiveMapProps {
    orders: Order[]
    drivers: Driver[]
    selectedDriverIds: Set<string>
    driverFilter: 'all' | 'live' | 'offline'
    userLocation: [number, number] | null
    forceTheme?: 'light' | 'dark'
    onOrderDeleted?: (orderId: string) => void
}

export default function InteractiveMap({ orders, drivers, selectedDriverIds, driverFilter, userLocation, forceTheme, onOrderDeleted }: InteractiveMapProps) {

    const { theme } = useTheme()
    // Use forced theme if provided, otherwise fallback to system theme
    const currentTheme = forceTheme || theme
    const isDark = currentTheme === 'dark'

    // Fix default icons
    useEffect(() => {
        // @ts-ignore
        delete L.Icon.Default.prototype._getIconUrl
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        })
    }, [])

    // Filter logic — multi-select + filter support
    const displayedOrders = useMemo(() => {
        if (selectedDriverIds.size === 0) {
            // Global view: Show ALL orders
            return orders
        }
        // Selected view: Show orders for selected drivers + unassigned
        return orders.filter(o => !o.driver_id || selectedDriverIds.has(o.driver_id))
    }, [orders, selectedDriverIds])

    const displayedDrivers = useMemo(() => {
        // 1. Only drivers with known location
        let filtered = drivers.filter(d => d.current_lat && d.current_lng)

        // 2. Apply filter tab
        if (driverFilter === 'live') filtered = filtered.filter(d => isDriverOnline(d))
        if (driverFilter === 'offline') filtered = filtered.filter(d => !isDriverOnline(d))

        // 3. If specific drivers selected, show only those
        if (selectedDriverIds.size > 0) {
            filtered = filtered.filter(d => selectedDriverIds.has(d.id))
        }

        return filtered
    }, [drivers, selectedDriverIds, driverFilter])

    // Count orders without GPS (for debugging/warning)
    const ordersWithoutGPS = useMemo(() => {
        return displayedOrders.filter(o => !o.latitude || !o.longitude)
    }, [displayedOrders])

    const routePositions = useMemo(() => {
        // Only show route line when exactly 1 driver is selected
        if (selectedDriverIds.size !== 1 || displayedDrivers.length === 0 || displayedOrders.length === 0) return []
        const driver = displayedDrivers[0]
        if (!driver.current_lat || !driver.current_lng) return []

        const points: [number, number][] = []
        points.push([driver.current_lat, driver.current_lng])

        const sortedOrders = [...displayedOrders].sort((a, b) => (a.route_index || 0) - (b.route_index || 0))
        sortedOrders.forEach(o => {
            if (o.latitude && o.longitude) points.push([Number(o.latitude), Number(o.longitude)])
        })
        return points
    }, [displayedDrivers, displayedOrders, selectedDriverIds])


    if (!userLocation) return <div className="h-full w-full bg-slate-100 dark:bg-slate-900 animate-pulse flex items-center justify-center"><MapPin className="animate-bounce" /></div>

    return (
        <MapContainer
            center={userLocation}
            zoom={13}
            className="h-full w-full bg-slate-100 dark:bg-slate-900 z-0"
            style={{ height: '100%', width: '100%', minHeight: '100%' }}
            zoomControl={false}
        >
            <CachedTileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url={isDark
                    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                }
            />

            <MapController
                orders={displayedOrders}
                drivers={displayedDrivers}
                selectedDriverIds={selectedDriverIds}
            />

            {selectedDriverIds.size === 1 && routePositions.length > 1 && (
                <Polyline
                    positions={routePositions}
                    color="#3b82f6"
                    weight={4}
                    opacity={0.8}
                    dashArray="10, 10"
                />
            )}

            {displayedOrders.map((order, index) => {
                if (!order.latitude || !order.longitude) return null

                // Jitter Logic for Overlapping Markers
                const lat = Number(order.latitude)
                const lng = Number(order.longitude)

                // Find how many others are at this exact spot
                const collisionGroup = displayedOrders.filter(
                    o => Math.abs(Number(o.latitude) - lat) < 0.00001 &&
                        Math.abs(Number(o.longitude) - lng) < 0.00001
                )

                let finalLat = lat
                let finalLng = lng

                // If collision exists, offset them in a small circle/spiral
                if (collisionGroup.length > 1) {
                    const idxInGroup = collisionGroup.findIndex(o => o.id === order.id)
                    // Radius ~100m for very clear separation
                    const radius = 0.0009
                    // Distribute angles evenly, starting from 90deg (Horizontal spread)
                    const angle = (idxInGroup / collisionGroup.length) * 2 * Math.PI + (Math.PI / 2)

                    finalLat = lat + Math.cos(angle) * radius
                    finalLng = lng + Math.sin(angle) * radius
                }

                return (
                    <Marker
                        key={order.id}
                        position={[finalLat, finalLng]}
                        icon={createOrderIcon(order.status, selectedDriverIds.size === 1 ? index + 1 : undefined)}
                    >
                        <Popup className="rounded-2xl overflow-hidden border-0 shadow-2xl leaflet-popup-no-margin">
                            <div className="p-4 min-w-[220px] bg-white dark:bg-slate-950 font-sans">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                        <Package size={20} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-slate-900 dark:text-white text-[15px] truncate px-1">#{order.order_number}</p>
                                        <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 truncate px-1">{order.customer_name}</p>
                                        {collisionGroup.length > 1 && (
                                            <div className="mt-1.5 flex items-center">
                                                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded shadow-sm border border-amber-200 dark:border-amber-800">
                                                    Overlapping Location
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800 mb-3">
                                    <div className="flex items-start gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                                        <MapPin size={16} className="mt-0.5 flex-shrink-0 text-slate-400" />
                                        <p className="font-medium leading-tight">{order.address}</p>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation()
                                            if (confirm(`Are you sure you want to delete order #${order.order_number}?`)) {
                                                const { error } = await supabase.from('orders').delete().eq('id', order.id)
                                                if (error) {
                                                    alert('Failed to delete order')
                                                    console.error(error)
                                                } else {
                                                    if (onOrderDeleted) onOrderDeleted(order.id)
                                                }
                                            }
                                        }}
                                        className="text-rose-500 hover:text-white hover:bg-rose-500 bg-rose-50 dark:bg-rose-950/30 dark:hover:bg-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all w-full justify-center border border-transparent hover:border-rose-600"
                                    >
                                        <Trash2 size={14} /> Delete Order
                                    </button>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                )
            })}

            {displayedDrivers.map((driver) => (
                driver.current_lat && driver.current_lng && (
                    <AnimatedMarker
                        key={driver.id}
                        position={[driver.current_lat, driver.current_lng]}
                        icon={createDriverIcon(isDriverOnline(driver))}
                        zIndexOffset={1000}
                        duration={1000}
                    >
                        <Popup className="rounded-2xl overflow-hidden border-0 shadow-2xl leaflet-popup-no-margin">
                            <div className="p-4 min-w-[220px] bg-white dark:bg-slate-950 font-sans">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white shadow-inner ${isDriverOnline(driver) ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-slate-400 to-slate-600'}`}>
                                        <Truck size={22} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-slate-900 dark:text-white text-base truncate pr-2">{driver.name}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={`w-2 h-2 rounded-full ${isDriverOnline(driver) ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                            <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">
                                                {isDriverOnline(driver) ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                                    {driver.last_location_update && (
                                        <div className="flex items-center justify-between text-[13px]">
                                            <span className="text-slate-500 font-semibold">Last ping</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-300">
                                                {(() => {
                                                    const diff = Date.now() - new Date(driver.last_location_update).getTime()
                                                    const seconds = Math.floor(diff / 1000)
                                                    if (seconds < 60) return `${seconds}s ago`
                                                    const minutes = Math.floor(seconds / 60)
                                                    if (minutes < 60) return `${minutes}m ago`
                                                    const hours = Math.floor(minutes / 60)
                                                    return `${hours}h ago`
                                                })()}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-[13px]">
                                        <span className="text-slate-500 font-semibold">Coords</span>
                                        <span className="font-mono font-medium text-slate-900 dark:text-slate-300 text-[11px] bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded shadow-sm border border-slate-200 dark:border-slate-700">
                                            {driver.current_lat?.toFixed(4)}, {driver.current_lng?.toFixed(4)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </AnimatedMarker>
                )
            ))}
        </MapContainer>
    )
}
