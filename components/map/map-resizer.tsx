"use client"

import { useEffect } from "react"
import { useMap } from "react-leaflet"

/**
 * Leaflet map resizer — calls invalidateSize() after mount and on container resize.
 * Place inside a <MapContainer> to fix tiles not rendering in flex/dynamic layouts.
 */
export default function MapResizer() {
    const map = useMap()

    useEffect(() => {
        if (!map) return

        // Delay to ensure container has its final size after layout
        const timer1 = setTimeout(() => map.invalidateSize(), 100)
        const timer2 = setTimeout(() => map.invalidateSize(), 500)
        const timer3 = setTimeout(() => map.invalidateSize(), 1000)

        // Also listen for container resize
        const observer = new ResizeObserver(() => {
            map.invalidateSize()
        })

        const container = map.getContainer()
        if (container) {
            observer.observe(container)
        }

        return () => {
            clearTimeout(timer1)
            clearTimeout(timer2)
            clearTimeout(timer3)
            observer.disconnect()
        }
    }, [map])

    return null
}
