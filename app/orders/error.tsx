"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function OrdersError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Orders error:", error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Something went wrong</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md">
                An error occurred while loading orders. Please try again.
            </p>
            <pre className="text-xs text-red-500 bg-red-50/50 p-4 rounded-lg border border-red-100 max-w-[80vw] overflow-auto whitespace-pre-wrap">
                {error.message}
            </pre>
            <Button onClick={reset} variant="default">
                Try again
            </Button>
        </div>
    )
}
