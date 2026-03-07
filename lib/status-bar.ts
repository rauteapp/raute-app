// ============================================
// STATUS BAR HELPER — iOS Native Integration
// ============================================
// Syncs the iOS status bar style with the app theme

import { Capacitor } from '@capacitor/core'

export async function setStatusBarStyle(isDark: boolean): Promise<void> {
    if (!Capacitor.isNativePlatform()) return

    try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        // iOS convention: Light style = white text (for dark backgrounds)
        // Dark style = dark text (for light backgrounds)
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
    } catch (e) {
        // StatusBar plugin not available (web)
        // StatusBar not available
    }
}

export async function setStatusBarOverlay(overlay: boolean): Promise<void> {
    if (!Capacitor.isNativePlatform()) return

    try {
        const { StatusBar } = await import('@capacitor/status-bar')
        await StatusBar.setOverlaysWebView({ overlay })
    } catch (e) {
        // StatusBar not available
    }
}
