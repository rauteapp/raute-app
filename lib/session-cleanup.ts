import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

/**
 * Cleanup truly orphaned session data from DEPRECATED storage implementations.
 * 
 * CRITICAL: This must NOT delete keys that capacitorStorage is actively using!
 * The active storage key format is: sb-{project_ref}-auth-token
 * with optional chunked suffixes: .0, .1, .2, etc.
 * 
 * Only clean up keys from OLD/deprecated storage implementations that are
 * no longer in use (e.g., a different project ref or a different format).
 */
export async function cleanupOrphanedSessions() {
    if (!Capacitor.isNativePlatform()) {
        return
    }

    try {
        // IMPORTANT: Do NOT delete the active session keys!
        // The active key is: sb-ysqcovxkqviufagguvue-auth-token (and .0, .1, etc.)
        // These are used by capacitorStorage and deleting them will log the user out.
        
        // Only clean up keys from completely different/deprecated storage formats
        // that are known to no longer be used.
        const deprecatedKeys: string[] = [
            // Add truly deprecated keys here if any exist
            // DO NOT add 'sb-ysqcovxkqviufagguvue-auth-token' variants — those are ACTIVE
        ]

        let removedCount = 0
        for (const key of deprecatedKeys) {
            const { value } = await Preferences.get({ key })
            if (value) {
                await Preferences.remove({ key })
                removedCount++
            }
        }

        if (removedCount > 0) {
        }
    } catch (error) {
        console.error('❌ Session cleanup failed:', error)
    }
}

/**
 * Check if session data appears corrupted or invalid.
 * IMPORTANT: Do NOT flag expired sessions as corrupted — Supabase handles
 * token refresh automatically. Only flag structurally broken sessions.
 */
export function isSessionCorrupted(session: unknown): boolean {
    if (!session) return false
    
    if (typeof session !== 'object') return true

    try {
        const sess = session as Record<string, any>
        
        // Only check for structural corruption, NOT expiry
        // Supabase auto-refreshes expired tokens — don't kill them
        if (!sess.access_token || typeof sess.access_token !== 'string') {
            return true
        }

        if (!sess.user || !sess.user.id) {
            return true
        }

        // DO NOT check expires_at — let Supabase handle token refresh
        return false
    } catch (error) {
        console.error('❌ Session validation error:', error)
        return true
    }
}
