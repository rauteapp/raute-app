"use client"

import { useEffect, useState } from "react"
import { Capacitor } from "@capacitor/core"

export function WebSpeedInsights() {
    const [show, setShow] = useState(false)

    useEffect(() => {
        // Only show on web (not Capacitor native)
        if (!Capacitor.isNativePlatform()) {
            setShow(true)
        }
    }, [])

    if (!show) return null

    // Dynamic import to avoid SSR issues
    const SpeedInsights = require("@vercel/speed-insights/next").SpeedInsights
    return <SpeedInsights />
}
