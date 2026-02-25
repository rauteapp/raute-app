"use client"

import { useEffect, useRef } from "react"
import { Marker, Popup } from "react-leaflet"
import L from "leaflet"

interface AnimatedMarkerProps {
    position: [number, number]
    icon: L.DivIcon
    zIndexOffset?: number
    children?: React.ReactNode
    duration?: number // Animation duration in ms
}

export default function AnimatedMarker({
    position,
    icon,
    zIndexOffset,
    children,
    duration = 1000,
}: AnimatedMarkerProps) {
    const markerRef = useRef<L.Marker>(null)
    const animationRef = useRef<number | null>(null)

    useEffect(() => {
        const marker = markerRef.current
        if (!marker) return

        const startPos = marker.getLatLng()
        const endPos = L.latLng(position[0], position[1])

        // Skip animation if positions are essentially the same (<1 meter)
        if (startPos.distanceTo(endPos) < 1) return

        const startTime = performance.now()

        function animate(currentTime: number) {
            if (!marker) return
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)

            // Ease-out cubic for natural deceleration
            const eased = 1 - Math.pow(1 - progress, 3)

            const lat = startPos.lat + (endPos.lat - startPos.lat) * eased
            const lng = startPos.lng + (endPos.lng - startPos.lng) * eased

            marker.setLatLng([lat, lng])

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate)
            }
        }

        // Cancel any existing animation
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current)
        }

        animationRef.current = requestAnimationFrame(animate)

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
            }
        }
    }, [position[0], position[1], duration])

    return (
        <Marker
            ref={markerRef}
            position={position}
            icon={icon}
            zIndexOffset={zIndexOffset}
        >
            {children}
        </Marker>
    )
}
