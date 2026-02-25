'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { setStatusBarStyle } from '@/lib/status-bar'

/**
 * StatusBarManager — syncs iOS status bar with the current theme.
 * Place inside <ThemeProvider> in app/layout.tsx.
 */
export function StatusBarManager() {
    const { resolvedTheme } = useTheme()

    useEffect(() => {
        // resolvedTheme accounts for "system" preference
        if (resolvedTheme) {
            setStatusBarStyle(resolvedTheme === 'dark')
        }
    }, [resolvedTheme])

    return null // Invisible component — side-effect only
}
