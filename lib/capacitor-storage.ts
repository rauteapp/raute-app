import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

/**
 * Custom Storage Adapter for Supabase Auth
 * Uses Capacitor Preferences on native platforms (iOS/Android)
 * Falls back to localStorage on web
 */
export const capacitorStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Retry Preferences.get in case native bridge isn't ready on cold start
        // Use 5 attempts with increasing delays for resilience after force-stop
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const result = await Preferences.get({ key })
            if (attempt > 0 && result.value) {
            }
            return result.value
          } catch (err) {
            if (attempt < 4) {
              const delay = 150 * (attempt + 1) // 150, 300, 450, 600ms
              await new Promise(resolve => setTimeout(resolve, delay))
            } else {
              console.error('❌ Storage getItem failed after 5 retries:', key, err)
              return null // Return null but do NOT delete the key
            }
          }
        }
        return null
      }

      // Web fallback
      if (typeof window !== 'undefined') {
        return window.localStorage.getItem(key)
      }

      return null
    } catch (error) {
      console.error('❌ Storage getItem error:', error)
      return null // Never delete data on read errors
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key, value })
        return
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value)
      }
    } catch (error) {
      console.error('❌ Storage setItem error:', error)
      // Do NOT delete the key on write failure — preserve existing data
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.remove({ key })
        return
      }

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key)
      }
    } catch (error) {
      console.error('❌ Storage removeItem error:', error)
    }
  },

  /**
   * Clear ALL Supabase auth data from storage
   * Only call this explicitly for recovery from corrupted state
   */
  async clearAllAuthData(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        const { keys } = await Preferences.keys()
        const authKeys = keys.filter(key =>
          key.includes('supabase') ||
          key.includes('sb-') ||
          key.includes('auth-token') ||
          key.includes('raute-') ||
          key.includes('pkce') ||
          key.includes('code-verifier')
        )

        for (const key of authKeys) {
          await Preferences.remove({ key })
        }
      } else if (typeof window !== 'undefined') {
        const keysToRemove: string[] = []
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i)
          if (key && (key.includes('supabase') || key.includes('sb-') || key.includes('auth-token') || key.includes('raute-') || key.includes('pkce') || key.includes('code-verifier'))) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(key => window.localStorage.removeItem(key))
      }
    } catch (error) {
      console.error('❌ Failed to clear auth data:', error)
    }
  }
}
