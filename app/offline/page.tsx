'use client'
import { WifiOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Offline Page
 * Shown when the app fails to load due to no internet connection
 */
export default function OfflinePage() {
    const router = useRouter()
    const [isOnline, setIsOnline] = useState(false)

    useEffect(() => {
        // Check if we're actually back online
        const checkConnection = () => {
            setIsOnline(navigator.onLine)
            if (navigator.onLine) {
                // Auto-refresh when connection is restored
                router.refresh()
            }
        }

        checkConnection()

        window.addEventListener('online', checkConnection)
        window.addEventListener('offline', () => setIsOnline(false))

        return () => {
            window.removeEventListener('online', checkConnection)
            window.removeEventListener('offline', () => setIsOnline(false))
        }
    }, [router])

    const handleRetry = () => {
        if (navigator.onLine) {
            router.refresh()
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4 safe-area-p">
            <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
                {/* Icon */}
                <div className="mb-6">
                    <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                        <WifiOff className="w-10 h-10 text-red-600 dark:text-red-400" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    No Internet Connection
                </h1>

                {/* Description */}
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                    Please check your internet connection and try again. Raute requires an active internet connection to function.
                </p>

                {/* Status */}
                {isOnline && (
                    <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <p className="text-green-700 dark:text-green-400 text-sm font-medium">
                            ✓ Connection restored! Refreshing...
                        </p>
                    </div>
                )}

                {/* Retry Button */}
                <button
                    onClick={handleRetry}
                    disabled={!isOnline}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <RefreshCw className="w-5 h-5" />
                    Try Again
                </button>

                {/* Tips */}
                <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-left">
                        <strong className="block mb-2">Troubleshooting:</strong>
                        • Check your WiFi or mobile data<br />
                        • Make sure airplane mode is off<br />
                        • Try moving to an area with better signal
                    </p>
                </div>
            </div>
        </div>
    )
}
