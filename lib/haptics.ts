// ============================================
// iOS HAPTIC FEEDBACK UTILITY
// ============================================
// Provides premium tactile feedback for key actions

import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

export class HapticFeedback {

    /**
     * Check if haptics are supported
     */
    private static isSupported(): boolean {
        return Capacitor.isNativePlatform()
    }

    /**
     * Light impact (e.g., button tap, toggle)
     */
    static async light(): Promise<void> {
        if (!this.isSupported()) return
        try {
            await Haptics.impact({ style: ImpactStyle.Light })
        } catch (e) {
            // Haptics not available
        }
    }

    /**
     * Medium impact (e.g., selection change, drag drop)
     */
    static async medium(): Promise<void> {
        if (!this.isSupported()) return
        try {
            await Haptics.impact({ style: ImpactStyle.Medium })
        } catch (e) {
            // Haptics not available
        }
    }

    /**
     * Heavy impact (e.g., route dispatched, POD captured)
     */
    static async heavy(): Promise<void> {
        if (!this.isSupported()) return
        try {
            await Haptics.impact({ style: ImpactStyle.Heavy })
        } catch (e) {
            // Haptics not available
        }
    }

    /**
     * Success notification (e.g., order delivered, optimization complete)
     */
    static async success(): Promise<void> {
        if (!this.isSupported()) return
        try {
            await Haptics.notification({ type: NotificationType.Success })
        } catch (e) {
            // Haptics not available
        }
    }

    /**
     * Warning notification (e.g., subscription limit reached)
     */
    static async warning(): Promise<void> {
        if (!this.isSupported()) return
        try {
            await Haptics.notification({ type: NotificationType.Warning })
        } catch (e) {
            // Haptics not available
        }
    }

    /**
     * Error notification (e.g., upload failed, dispatch blocked)
     */
    static async error(): Promise<void> {
        if (!this.isSupported()) return
        try {
            await Haptics.notification({ type: NotificationType.Error })
        } catch (e) {
            // Haptics not available
        }
    }

    /**
     * Selection vibration (e.g., scrolling through driver list)
     */
    static async selectionChanged(): Promise<void> {
        if (!this.isSupported()) return
        try {
            await Haptics.selectionChanged()
        } catch (e) {
            // Haptics not available
        }
    }

    /**
     * Custom vibration pattern (for complex interactions)
     */
    static async vibrate(duration: number = 200): Promise<void> {
        if (!this.isSupported()) return
        try {
            await Haptics.vibrate({ duration })
        } catch (e) {
            // Haptics not available
        }
    }
}

// Export convenience functions
export const hapticLight = () => HapticFeedback.light()
export const hapticMedium = () => HapticFeedback.medium()
export const hapticHeavy = () => HapticFeedback.heavy()
export const hapticSuccess = () => HapticFeedback.success()
export const hapticWarning = () => HapticFeedback.warning()
export const hapticError = () => HapticFeedback.error()
export const hapticSelection = () => HapticFeedback.selectionChanged()
