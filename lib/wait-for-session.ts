import { supabase } from '@/lib/supabase'
import { capacitorStorage } from '@/lib/capacitor-storage'
import type { Session } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'

/**
 * Wait for a Supabase session with retries.
 *
 * On Capacitor (iOS/Android), session restoration from Preferences is async.
 * After login, router.push fires immediately but getSession() may return null
 * because the session hasn't been persisted/read from native storage yet.
 *
 * On web, getSession() can hang due to navigator.locks contention (token refresh
 * holding the lock). After 2 timeouts, we fall back to getUser() which bypasses
 * locks and makes a direct API call.
 *
 * @param maxRetries - Number of retries (default: 8 for better mobile support)
 * @param delayMs - Delay between retries in ms (default: 500)
 * @returns The session, or null if not found after all retries
 */
export async function waitForSession(
    maxRetries = 8,
    delayMs = 500
): Promise<Session | null> {
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()
    let timeoutCount = 0

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // NATIVE FAST PATH: After 2 getSession timeouts, try getUser(jwt)
            // with the stored access_token. getUser(jwt) bypasses initializePromise
            // entirely (goes straight to the API call). If the stored token is valid,
            // we confirm the user, then try refreshSession() to bootstrap the client.
            if (isNative && timeoutCount >= 2) {
                console.log('⏳ waitForSession: native getUser(jwt) bypass...')
                try {
                    const stored = await capacitorStorage.getItem('sb-raute-auth')
                    if (stored) {
                        const parsed = JSON.parse(stored)
                        if (parsed?.access_token) {
                            // getUser(jwt) does NOT await initializePromise — direct API call
                            const { data: userData, error: userError } = await Promise.race([
                                supabase.auth.getUser(parsed.access_token),
                                new Promise<never>((_, reject) =>
                                    setTimeout(() => reject(new Error('getUser(jwt) timeout')), 5000)
                                ),
                            ])
                            if (!userError && userData.user) {
                                console.log('✅ waitForSession: user verified via getUser(jwt)', {
                                    userId: userData.user.id.substring(0, 8)
                                })
                                // Now try to bootstrap the full session
                                if (parsed.refresh_token) {
                                    const { data: refreshData } = await Promise.race([
                                        supabase.auth.refreshSession({ refresh_token: parsed.refresh_token }),
                                        new Promise<{ data: { session: null } }>((resolve) =>
                                            setTimeout(() => resolve({ data: { session: null } }), 5000)
                                        ),
                                    ])
                                    if (refreshData.session) {
                                        console.log('✅ waitForSession: native full recovery via getUser(jwt) + refreshSession!')
                                        return refreshData.session
                                    }
                                }
                                // refreshSession failed but user is verified — try getSession one more time
                                const { data } = await Promise.race([
                                    supabase.auth.getSession(),
                                    new Promise<{ data: { session: null } }>((resolve) =>
                                        setTimeout(() => resolve({ data: { session: null } }), 2000)
                                    ),
                                ])
                                if (data.session) return data.session
                            }
                        }
                    }
                } catch {
                    // Continue with normal retry
                }
            }

            // After 2 getSession timeouts on web, try getUser() as fallback.
            // getUser() makes a direct API call to Supabase (bypasses navigator.locks)
            // and if successful, proves the user is authenticated.
            if (!isNative && timeoutCount >= 2) {
                console.log('⏳ waitForSession: getSession blocked by locks, trying getUser() fallback...')
                try {
                    const { data: userData, error: userError } = await Promise.race([
                        supabase.auth.getUser(),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('getUser timeout')), 5000)
                        ),
                    ])

                    if (!userError && userData.user) {
                        console.log('✅ waitForSession: user verified via getUser()', {
                            userId: userData.user.id.substring(0, 8)
                        })
                        // Build a minimal session-like object from the user data.
                        // The actual session tokens are in cookies — Supabase middleware
                        // handles them. We just need to confirm the user is authenticated.
                        // Try one more getSession with longer timeout now that _initialize may have finished
                        const { data } = await Promise.race([
                            supabase.auth.getSession(),
                            new Promise<{ data: { session: null } }>((resolve) =>
                                setTimeout(() => resolve({ data: { session: null } }), 2000)
                            ),
                        ])
                        if (data.session) {
                            return data.session
                        }
                        // getSession still blocked — return null but the caller should
                        // still proceed since we confirmed the user is authenticated.
                        // Auth-check will allow through via stored auth cookie fallback.
                        return null
                    }
                } catch {
                    // getUser also failed — continue with normal retry
                }
            }

            // Add a timeout to getSession() — it can hang indefinitely when
            // _initialize() is blocked on a slow token refresh
            const { data, error } = await Promise.race([
                supabase.auth.getSession(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('getSession timeout')), 5000)
                ),
            ])

            if (error) {
                console.error('⚠️ waitForSession error:', error.message)

                // Handle session validation errors
                if (error.message.includes('string did not match') ||
                    error.message.includes('pattern') ||
                    error.message.includes('Invalid')) {
                    console.warn('⚠️ Session validation error - clearing corrupted data')

                    // Clear corrupted session
                    try {
                        await supabase.auth.signOut({ scope: 'local' })
                        const { capacitorStorage } = await import('@/lib/capacitor-storage')
                        await capacitorStorage.clearAllAuthData()
                    } catch (cleanupErr) {
                        console.error('Cleanup failed:', cleanupErr)
                    }

                    return null
                }

                // For other errors, don't continue retrying
                return null
            }

            if (data.session) {
                // Validate session data before returning
                if (!data.session.access_token || !data.session.user) {
                    console.error('❌ Invalid session data structure')
                    return null
                }

                console.log('✅ waitForSession: session found', {
                    userId: data.session.user.id.substring(0, 8),
                    attempt: attempt + 1
                })
                return data.session
            }

            // NATIVE RECOVERY: On Capacitor, if getSession() returns null, the
            // client's _initialize() likely timed out (hung on token refresh).
            // The session tokens are still in Preferences — read them and call
            // refreshSession() to bootstrap the client's internal session.
            //
            // refreshSession() fires TOKEN_REFRESHED (NOT SIGNED_IN), so it
            // won't trigger the auth-listener's redirect-to-dashboard loop.
            if (isNative && attempt >= 1) {
                try {
                    const stored = await capacitorStorage.getItem('sb-raute-auth')
                    if (stored) {
                        const parsed = JSON.parse(stored)
                        if (parsed?.refresh_token) {
                            console.log('🔄 waitForSession: native recovery — refreshing from stored token...')
                            const { data: refreshData, error: refreshError } = await Promise.race([
                                supabase.auth.refreshSession({
                                    refresh_token: parsed.refresh_token
                                }),
                                new Promise<never>((_, reject) =>
                                    setTimeout(() => reject(new Error('refreshSession timeout')), 5000)
                                ),
                            ])
                            if (!refreshError && refreshData.session) {
                                console.log('✅ waitForSession: native recovery succeeded!', {
                                    userId: refreshData.session.user.id.substring(0, 8)
                                })
                                return refreshData.session
                            }
                            console.warn('⚠️ waitForSession: native recovery failed:', refreshError?.message)
                        }
                    }
                } catch (recoveryErr: any) {
                    console.warn('⚠️ waitForSession: native recovery exception:', recoveryErr.message)
                }
            }

            if (attempt < maxRetries) {
                // Use shorter delay for first few attempts
                const currentDelay = attempt < 3 ? 300 : delayMs
                console.log(`⏳ waitForSession: no session yet (attempt ${attempt + 1}/${maxRetries + 1})`)
                await new Promise(resolve => setTimeout(resolve, currentDelay))
            }
        } catch (err: any) {
            console.error('❌ waitForSession exception:', err.message)

            const isLockTimeout = err.name === 'AbortError' ||
                err.message?.includes('aborted') ||
                err.message?.includes('getSession timeout')

            if (isLockTimeout) {
                timeoutCount++
                console.log(`⏳ Lock busy / getSession timeout (count: ${timeoutCount}), retrying...`)
            }

            // On exception, wait a bit and try again (unless it's the last attempt)
            if (attempt < maxRetries) {
                const retryDelay = isLockTimeout ? Math.max(delayMs, 1000) : delayMs
                await new Promise(resolve => setTimeout(resolve, retryDelay))
            }
        }
    }

    console.warn('⚠️ waitForSession: no session after all retries')
    return null
}
