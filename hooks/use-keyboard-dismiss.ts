// ============================================
// KEYBOARD DISMISS ON SCROLL — iOS Native Behavior
// ============================================
// On native iOS apps, scrolling dismisses the keyboard.
// This hook replicates that behavior for Capacitor WebView.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * Dismisses the virtual keyboard when the user scrolls.
 * Only activates on native platforms (Capacitor iOS/Android).
 *
 * Usage: Call `useKeyboardDismiss()` in form-heavy pages.
 */
export function useKeyboardDismiss() {
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return

        let scrollTimeout: ReturnType<typeof setTimeout>

        const handleScroll = () => {
            // Debounce to avoid excessive blur calls
            clearTimeout(scrollTimeout)
            scrollTimeout = setTimeout(() => {
                const active = document.activeElement as HTMLElement | null
                if (
                    active &&
                    (active.tagName === 'INPUT' ||
                        active.tagName === 'TEXTAREA' ||
                        active.getAttribute('contenteditable') === 'true')
                ) {
                    active.blur()
                }
            }, 100)
        }

        window.addEventListener('scroll', handleScroll, { passive: true })

        return () => {
            window.removeEventListener('scroll', handleScroll)
            clearTimeout(scrollTimeout)
        }
    }, [])
}
