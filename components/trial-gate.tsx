'use client'

import { usePathname } from 'next/navigation'
import { useTrialStatus } from '@/hooks/use-trial-status'
import { TrialBanner } from '@/components/trial-banner'
import { TrialFreezeOverlay } from '@/components/trial-freeze-overlay'

// Pages where the freeze overlay should NOT appear
const FREEZE_EXEMPT_ROUTES = ['/profile', '/login', '/signup', '/', '/privacy', '/terms', '/forgot-password', '/verify-email', '/auth']

export function TrialGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { isLoading, isFrozen, isTrialActive, daysRemaining } = useTrialStatus()

    const isExempt = FREEZE_EXEMPT_ROUTES.some(route =>
        pathname === route || pathname.startsWith(`${route}/`)
    )

    // Don't block anything while loading
    if (isLoading) return <>{children}</>

    return (
        <>
            {/* Show trial countdown banner during active trial (not on exempt routes) */}
            {isTrialActive && daysRemaining > 0 && !isExempt && (
                <TrialBanner daysRemaining={daysRemaining} />
            )}

            {children}

            {/* Show freeze overlay when trial expired and no subscription */}
            {isFrozen && !isExempt && <TrialFreezeOverlay />}
        </>
    )
}
