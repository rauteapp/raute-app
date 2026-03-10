'use client'
import { useEffect, useState } from 'react'

export function MobileAuthWrapper({
    children,
    mobileChildren
}: {
    children: React.ReactNode
    mobileChildren: React.ReactNode
}) {
    const [isMobile, setIsMobile] = useState(false)
    const [isNativeApp, setIsNativeApp] = useState(false)

    useEffect(() => {
        // 1. Check if running in Capacitor native app
        if (typeof window !== 'undefined' && (window as any).Capacitor) {
            const isNative = (window as any).Capacitor.isNativePlatform?.() ||
                (window as any).Capacitor.getPlatform?.() !== 'web';

            if (isNative) {
                setIsMobile(true)
                setIsNativeApp(true)
                return
            }
        }

        // 2. Also check viewport width for responsive mobile web
        const checkViewport = () => {
            if (typeof window !== 'undefined') {
                setIsMobile(window.innerWidth < 1024)
            }
        }
        checkViewport()

        window.addEventListener('resize', checkViewport)
        return () => window.removeEventListener('resize', checkViewport)
    }, [])

    // Show mobile version for Capacitor native OR small viewports
    return isMobile ? <>{mobileChildren}</> : <>{children}</>
}
