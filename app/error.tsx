'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('App error:', error)
    }, [error])

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="max-w-md w-full bg-card border border-border rounded-lg shadow-lg p-6 text-center">
                <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>

                <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>

                <p className="text-muted-foreground mb-6">
                    We encountered an unexpected error. Please try again.
                </p>
                <div className="bg-red-50 text-red-900 border border-red-200 p-4 rounded-md text-left text-xs overflow-auto max-h-48 mb-6 break-all">
                    <strong>Error:</strong> {error.message}
                    <br/><br/>
                    <strong>Stack:</strong> {error.stack}
                </div>

                <Button onClick={reset} className="w-full mb-3">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                </Button>

                <p className="text-xs text-muted-foreground">
                    If this persists, please contact{' '}
                    <a href="mailto:support@raute.io" className="text-blue-600 hover:underline">
                        support@raute.io
                    </a>
                </p>
            </div>
        </div>
    )
}
