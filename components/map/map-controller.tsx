"use client"

import { useEffect } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import type { Order, Driver } from "@/lib/supabase"

export interface MapControllerProps {
    orders: Order[]
    drivers: Driver[]
    selectedDriverIds: Set<string>
}

export default function MapController({ orders, drivers, selectedDriverIds }: MapControllerProps) {
    const map = useMap()

    useEffect(() => {
        if (!map) return

        const points: [number, number][] = []

        // Add Order locations
        orders.forEach(o => {
            if (o.latitude && o.longitude) points.push([Number(o.latitude), Number(o.longitude)])
        })

        // Add Driver locations
        drivers.forEach(d => {
            if (d.current_lat && d.current_lng) points.push([d.current_lat, d.current_lng])
        })

        if (selectedDriverIds.size === 1) {
            // -- FOLLOW MODE (single driver) --
            const driverId = Array.from(selectedDriverIds)[0]
            const driver = drivers.find(d => d.id === driverId)
            if (driver?.current_lat && driver?.current_lng) {
                map.flyTo([driver.current_lat, driver.current_lng], 16, { animate: true, duration: 1.5 })
            }
        } else if (points.length > 0) {
            // -- MULTI-SELECT or GLOBAL OVERVIEW --
            const bounds = L.latLngBounds(points)
            map.fitBounds(bounds, {
                padding: [60, 40],
                maxZoom: 16,
                animate: true,
                duration: 1
            })
        }
    }, [orders, drivers, selectedDriverIds, map])

    return null
}
