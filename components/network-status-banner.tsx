'use client'
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Network Status Banner
 * Shows a persistent banner when the device is offline
 */
export function NetworkStatusBanner() {
    const [isOnline, setIsOnline] = useState(true)
    const [showBanner, setShowBanner] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        // Check initial status
        setIsOnline(navigator.onLine)
        setShowBanner(!navigator.onLine)

        // Listen for online/offline events
        const handleOnline = () => {
            setIsOnline(true)
            setShowBanner(false)
        }

        const handleOffline = () => {
            setIsOnline(false)
            setShowBanner(true)
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    if (!mounted) return null
    if (!showBanner) return null

    return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-2 safe-area-pt shadow-lg">
            <div className="flex items-center justify-center gap-2 text-sm font-medium">
                <WifiOff className="w-4 h-4" />
                <span>No Internet Connection</span>
            </div>
        </div>
    )
}
