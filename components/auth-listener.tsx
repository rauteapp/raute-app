"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/toast-provider'
import { restoreCodeVerifier, clearCodeVerifierBackup } from '@/lib/pkce-backup'
import { capacitorStorage } from '@/lib/capacitor-storage'
import { RevenueCatService } from '@/lib/revenuecat-service'

const SESSION_BACKUP_KEY = 'raute-session-backup'

/**
 * Save session tokens to Preferences as a backup.
 * This is separate from Supabase's internal storage to ensure
 * session survives force-stop on iOS.
 */
async function backupSession(accessToken: string, refreshToken: string) {
    if (!Capacitor.isNativePlatform()) return
    try {
        const { Preferences } = await import('@capacitor/preferences')
        await Preferences.set({
            key: SESSION_BACKUP_KEY,
            value: JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
                saved_at: Date.now()
            })
        })
        console.log('💾 Session backed up to Preferences')
    } catch (err) {
        console.error('❌ Failed to backup session:', err)
    }
}

/**
 * Try to restore session from our backup when Supabase can't find its own.
 */
export async function restoreSessionFromBackup(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false
    try {
        const { Preferences } = await import('@capacitor/preferences')
        const { value } = await Preferences.get({ key: SESSION_BACKUP_KEY })
        if (!value) {
            console.log('📦 No session backup found')
            return false
        }

        const backup = JSON.parse(value)
        if (!backup.access_token || !backup.refresh_token) {
            console.log('📦 Invalid session backup data')
            return false
        }

        // Check if backup is too old (30 days)
        if (Date.now() - backup.saved_at > 30 * 24 * 60 * 60 * 1000) {
            console.log('📦 Session backup too old, clearing')
            await Preferences.remove({ key: SESSION_BACKUP_KEY })
            return false
        }

        console.log('📦 Restoring session from backup...')

        // Use refreshSession instead of setSession — more reliable when access_token is expired
        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: backup.refresh_token
        })

        if (error) {
            console.error('❌ Backup session restore failed:', error.message)
            // Fallback: try setSession in case refreshSession doesn't work
            const { data: fallbackData, error: fallbackError } = await supabase.auth.setSession({
                access_token: backup.access_token,
                refresh_token: backup.refresh_token
            })
            if (fallbackError || !fallbackData.session) {
                console.error('❌ Fallback setSession also failed')
                await Preferences.remove({ key: SESSION_BACKUP_KEY })
                return false
            }
            console.log('✅ Session restored via fallback setSession!')
            await backupSession(fallbackData.session.access_token, fallbackData.session.refresh_token)
            return true
        }

        if (data.session) {
            console.log('✅ Session restored from backup via refreshSession!')
            // Re-backup with fresh tokens
            await backupSession(data.session.access_token, data.session.refresh_token)
            return true
        }

        return false
    } catch (err) {
        console.error('❌ Backup restore error:', err)
        return false
    }
}

/**
 * Clear the session backup (on explicit sign-out).
 */
async function clearSessionBackup() {
    if (!Capacitor.isNativePlatform()) return
    try {
        const { Preferences } = await import('@capacitor/preferences')
        await Preferences.remove({ key: SESSION_BACKUP_KEY })
        console.log('🗑️ Session backup cleared')
    } catch (err) {
        console.error('❌ Failed to clear session backup:', err)
    }
}

export function AuthListener() {
    const { toast } = useToast()
    const router = useRouter()

    useEffect(() => {
        // Listen to ALL auth state changes to backup/clear session
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('🔔 AuthListener event:', event, 'hasSession:', !!session)

            if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
                // Backup session on every auth event
                await backupSession(session.access_token, session.refresh_token)

                // Initialize RevenueCat after auth is confirmed
                RevenueCatService.init().catch(err =>
                    console.error('RevenueCat init failed:', err)
                )

                // Safety net: If SIGNED_IN fires while on login page (OAuth flow),
                // redirect to dashboard. This catches cases where the PKCE exchange
                // handler's redirect doesn't execute (e.g. promise hangs after internal processing).
                if (event === 'SIGNED_IN' && Capacitor.isNativePlatform()) {
                    const currentPath = window.location.pathname
                    const currentHref = window.location.href
                    console.log('🔍 SIGNED_IN path check:', { currentPath, currentHref })
                    // Static export may use /login.html, /login/, or /login
                    const isOnLogin = currentPath === '/login' || currentPath === '/' ||
                        currentPath === '/login.html' || currentPath === '/login/' ||
                        currentPath.startsWith('/login')
                    if (isOnLogin) {
                        console.log('🔄 SIGNED_IN on login page — redirecting to dashboard')
                        setTimeout(() => {
                            router.push('/dashboard')
                        }, 500)
                    }
                }
            } else if (event === 'INITIAL_SESSION' && !session && Capacitor.isNativePlatform()) {
                // Cold start after force-stop: Supabase's _initialize() may have failed
                // to read from Capacitor Preferences (bridge not ready yet).
                // Try to restore from our redundant backup after a short delay.
                console.log('📱 INITIAL_SESSION null on native — attempting backup restore...')
                setTimeout(async () => {
                    try {
                        const restored = await restoreSessionFromBackup()
                        if (restored) {
                            console.log('✅ AuthListener: session restored from backup after cold start')
                        }
                    } catch (err) {
                        console.warn('⚠️ AuthListener backup restore failed:', err)
                    }
                }, 500)
            } else if (event === 'SIGNED_OUT') {
                await clearSessionBackup()
            }
        })

        // Helper: verify session is persisted, then navigate to dashboard
        // Uses router.push for client-side navigation to preserve Supabase
        // session in memory (avoids redirect loop from full page reload).
        async function waitForSessionAndNavigate() {
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 400))
                const { data } = await supabase.auth.getSession()
                if (data.session) {
                    console.log(`✅ Session verified on check ${i + 1}, navigating to dashboard`)
                    toast({
                        title: 'Welcome Back!',
                        description: 'Successfully logged in.',
                        type: 'success'
                    })
                    router.push('/dashboard')
                    return true
                }
            }
            console.error('❌ Session not found after 5 verification checks')
            return false
        }

        // Listen for deep links (e.g. io.raute.app://auth/callback?code=...)
        const listener = App.addListener('appUrlOpen', async ({ url }) => {
            console.log('🔗 Deep link received:', url)

            if (url.includes('auth/callback')) {
                try {
                    await Browser.close()
                } catch (e) {}

                await new Promise(resolve => setTimeout(resolve, 500))

                const parsedUrl = new URL(url)
                const hashParams = new URLSearchParams(url.split('#')[1] || '')

                // Check both query params AND hash fragment (iOS may use either)
                const code = parsedUrl.searchParams.get('code')
                const error = parsedUrl.searchParams.get('error') || hashParams.get('error')
                const errorDescription = parsedUrl.searchParams.get('error_description') || hashParams.get('error_description')
                const accessToken = hashParams.get('access_token') || parsedUrl.searchParams.get('access_token')
                const refreshToken = hashParams.get('refresh_token') || parsedUrl.searchParams.get('refresh_token')

                console.log('🔗 Parsed callback:', { hasCode: !!code, hasAccessToken: !!accessToken, hasError: !!error })

                if (error) {
                    // Clear stale auth data on OAuth error to prevent poisoning
                    console.log('🧹 OAuth error received, clearing auth data...')
                    await supabase.auth.signOut({ scope: 'local' })
                    await capacitorStorage.clearAllAuthData()

                    toast({
                        title: 'Login Error',
                        description: errorDescription || error,
                        type: 'error'
                    })
                    return
                }

                // PKCE code exchange
                if (code) {
                    console.log('🔐 [PKCE] Step 1: Got authorization code, starting exchange...')
                    console.log('🔐 [PKCE] Code prefix:', code.substring(0, 12) + '...')
                    let lastError = ''

                    // Attempt 1: Direct code exchange (verifier should be in Supabase storage)
                    console.log('🔐 [PKCE] Step 2: Attempting direct exchangeCodeForSession...')
                    try {
                        const startTime = Date.now()
                        const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
                        const elapsed = Date.now() - startTime
                        console.log(`🔐 [PKCE] Step 2 result (${elapsed}ms):`, {
                            success: !sessionError && !!data.session,
                            error: sessionError?.message || null,
                            hasSession: !!data?.session,
                        })
                        if (!sessionError && data.session) {
                            console.log('✅ [PKCE] Exchange succeeded on attempt 1!')
                            await backupSession(data.session.access_token, data.session.refresh_token)
                            await clearCodeVerifierBackup()
                            router.push('/dashboard')
                            return
                        }
                        lastError = sessionError?.message || 'Unknown error'
                    } catch (err: any) {
                        lastError = err?.message || 'Exception'
                        console.error('🔐 [PKCE] Step 2 exception:', lastError)
                    }

                    // Attempt 2: Restore code verifier from backup, then retry
                    console.log('🔐 [PKCE] Step 3: Restoring code verifier from backup...')
                    const restored = await restoreCodeVerifier()
                    console.log('🔐 [PKCE] Step 3: Restore result:', restored)
                    if (restored) {
                        await new Promise(resolve => setTimeout(resolve, 300))
                        console.log('🔐 [PKCE] Step 4: Retrying exchange with restored verifier...')
                        try {
                            const startTime = Date.now()
                            const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
                            const elapsed = Date.now() - startTime
                            console.log(`🔐 [PKCE] Step 4 result (${elapsed}ms):`, {
                                success: !sessionError && !!data.session,
                                error: sessionError?.message || null,
                            })
                            if (!sessionError && data.session) {
                                console.log('✅ [PKCE] Exchange succeeded on attempt 2 (restored verifier)!')
                                await backupSession(data.session.access_token, data.session.refresh_token)
                                await clearCodeVerifierBackup()
                                router.push('/dashboard')
                                return
                            }
                            lastError = sessionError?.message || 'Unknown error'
                        } catch (err: any) {
                            lastError = err?.message || 'Exception'
                            console.error('🔐 [PKCE] Step 4 exception:', lastError)
                        }
                    }

                    // Attempt 3: Check if session was set by onAuthStateChange
                    console.log('🔐 [PKCE] Step 5: Waiting 1.5s for onAuthStateChange...')
                    await new Promise(resolve => setTimeout(resolve, 1500))
                    const { data: sessionData } = await supabase.auth.getSession()
                    console.log('🔐 [PKCE] Step 5: Session check result:', {
                        hasSession: !!sessionData.session,
                        userId: sessionData.session?.user?.id?.substring(0, 8) || null,
                    })
                    if (sessionData.session) {
                        console.log('✅ [PKCE] Session found via onAuthStateChange!')
                        await backupSession(sessionData.session.access_token, sessionData.session.refresh_token)
                        await clearCodeVerifierBackup()
                        router.push('/dashboard')
                        return
                    }

                    // All attempts failed — only clear PKCE-related data, NOT the full session.
                    console.error('❌ [PKCE] All attempts failed. Last error:', lastError)
                    await clearCodeVerifierBackup()

                    toast({
                        title: 'Sign In Incomplete',
                        description: lastError.includes('invalid')
                            ? 'Authentication code expired. Please try again.'
                            : 'Could not complete sign in. Please try again.',
                        type: 'error'
                    })
                    return
                }

                // Implicit flow tokens (from hash fragment)
                if (accessToken && refreshToken) {
                    console.log('🔐 Setting session from hash tokens...')
                    const { data: tokenData, error: setError } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    })

                    if (!setError && tokenData.session) {
                        await backupSession(tokenData.session.access_token, tokenData.session.refresh_token)
                        toast({
                            title: 'Welcome Back!',
                            description: 'Successfully logged in.',
                            type: 'success'
                        })
                        router.push('/dashboard')
                    } else {
                        console.error('❌ setSession failed:', setError?.message)
                        toast({
                            title: 'Login Failed',
                            description: setError?.message || 'Could not complete sign in.',
                            type: 'error'
                        })
                    }
                    return
                }

                // No code or tokens — check session anyway
                console.log('🔄 No code or tokens in URL, checking for session...')
                await new Promise(resolve => setTimeout(resolve, 1000))
                const { data: fallbackSession } = await supabase.auth.getSession()
                if (fallbackSession.session) {
                    await waitForSessionAndNavigate()
                }
            }
        })

        // Listen for app state changes (resume/pause)
        const appStateListener = App.addListener('appStateChange', async ({ isActive }) => {
            if (isActive) {
                console.log('📱 App resumed')
                try {
                    const { data } = await supabase.auth.getSession()
                    if (data.session) {
                        // Only refresh if the token is close to expiring (within 5 minutes)
                        const expiresAt = data.session.expires_at
                        const now = Math.floor(Date.now() / 1000)
                        if (expiresAt && (expiresAt - now) < 300) {
                            await supabase.auth.refreshSession()
                            console.log('✅ Session refreshed on resume (was near expiry)')
                        } else {
                            console.log('✅ Session still valid on resume, no refresh needed')
                        }
                    }
                } catch (err) {
                    // AbortError is common on resume — ignore it, session is still valid
                    console.warn('⚠️ Session refresh on resume failed (non-critical):', err)
                }
            }
        })

        return () => {
            subscription.unsubscribe()
            listener.then(handle => handle.remove())
            appStateListener.then(handle => handle.remove())
        }
    }, [toast, router])

    return null
}
