'use client'

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import L from 'leaflet'
import { Order } from '@/lib/supabase'

// Fix Leaflet Icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom Icon for Sequence Numbers
const createNumberIcon = (number: number) => new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: #2563eb; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${number}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
})

// Map Bounds Controller
function MapBounds({ orders }: { orders: Order[] }) {
    const map = useMap()

    useEffect(() => {
        if (orders.length > 0) {
            const bounds = L.latLngBounds(orders.map(o => [Number(o.latitude!), Number(o.longitude!)]))
            map.fitBounds(bounds, { padding: [50, 50] })
        }
    }, [orders, map])

    return null
}

export default function DriverRouteMap({ orders }: { orders: Order[] }) {
    // Filter valid coordinates and ensure they're numbers (Supabase returns numeric as strings)
    const validOrders = orders.filter(o => {
        const lat = Number(o.latitude)
        const lng = Number(o.longitude)
        return !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)
    })

    if (validOrders.length === 0) {
        return (
            <div className="flex items-center justify-center h-full bg-muted/20">
                <p className="text-muted-foreground">No locations to map</p>
            </div>
        )
    }

    // --- JITTER / SPIDERFY LOGIC ---
    // 1. Group by exact location to detect collisions
    const locationGroups: Record<string, Order[]> = {}
    validOrders.forEach(o => {
        const lat = Number(o.latitude)
        const lng = Number(o.longitude)
        const key = `${lat.toFixed(6)},${lng.toFixed(6)}`
        if (!locationGroups[key]) locationGroups[key] = []
        locationGroups[key].push(o)
    })

    // 2. Calculate displayed positions
    const displayOrders = validOrders.map(order => {
        const lat = Number(order.latitude!)
        const lng = Number(order.longitude!)
        const key = `${lat.toFixed(6)},${lng.toFixed(6)}`
        const group = locationGroups[key]

        let finalLat = lat
        let finalLng = lng

        if (group.length > 1) {
            const idx = group.findIndex(o => o.id === order.id)
            // Radius ~100m for very clear separation
            const radius = 0.0009
            // Distribute angles evenly, starting from 90deg (Horizontal spread)
            const angle = (idx / group.length) * 2 * Math.PI + (Math.PI / 2)

            finalLat = lat + Math.cos(angle) * radius
            finalLng = lng + Math.sin(angle) * radius
        }

        return {
            ...order,
            displayLat: finalLat,
            displayLng: finalLng
        }
    })

    const positions = displayOrders.map(o => [o.displayLat, o.displayLng] as [number, number])

    return (
        <MapContainer
            center={[displayOrders[0].displayLat, displayOrders[0].displayLng]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapBounds orders={validOrders} />

            {/* Draw Line connecting stops */}
            <Polyline
                positions={positions}
                color="#2563eb"
                weight={4}
                opacity={0.7}
                dashArray="10, 10"
            />

            {/* Markers */}
            {displayOrders.map((order) => (
                <Marker
                    key={order.id}
                    position={[order.displayLat, order.displayLng]}
                    icon={createNumberIcon(order.route_index || 0)}
                >
                    <Popup>
                        <div className="p-1">
                            <span className="font-bold block mb-1">#{order.route_index} - {order.customer_name}</span>
                            <span className="text-xs text-slate-500">{order.address}</span>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    )
}
