"use client"

import { useEffect, useState, type ReactNode } from "react"

/**
 * Wrapper that only renders children after client-side mount.
 * Prevents React hydration error #418 on Capacitor by ensuring
 * server-rendered HTML matches client render (both render fallback).
 */
export function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return fallback ?? null
    }

    return <>{children}</>
}
