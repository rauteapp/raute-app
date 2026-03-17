"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

/**
 * Validate that a redirect URL is safe (relative path or raute.io domain only).
 * Returns the URL if valid, or the fallback otherwise.
 */
function validateRedirectUrl(url: string, fallback: string = '/dashboard'): string {
  // Allow relative URLs (must start with /)
  if (url.startsWith('/') && !url.startsWith('//')) {
    return url
  }

  // Allow raute.io domain
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'raute.io' || parsed.hostname.endsWith('.raute.io')) {
      return url
    }
  } catch {
    // Invalid URL — use fallback
  }

  return fallback
}

/**
 * Sanitize a URL parameter for safe display.
 * Strips HTML tags and limits length to prevent abuse.
 */
function sanitizeDisplayParam(value: string, maxLength: number = 200): string {
  return String(value)
    .replace(/[<>"'&]/g, '') // Strip characters that could break out of HTML context
    .slice(0, maxLength)
}

export default function AuthCallback() {
  const router = useRouter()
  const hasRedirected = useRef(false)
  const [status, setStatus] = useState('Completing sign in...')
  const [showAppRedirect, setShowAppRedirect] = useState(false)
  const [showExpiredLink, setShowExpiredLink] = useState(false)
  const [expiredLinkError, setExpiredLinkError] = useState('')

  useEffect(() => {
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

    // Helper: sync role and redirect to dashboard
    const syncRoleAndRedirect = async (userId: string, emailConfirmedAt: string | null | undefined) => {
      if (hasRedirected.current) return

      // Check email verification
      if (!emailConfirmedAt) {
        hasRedirected.current = true
        window.location.href = validateRedirectUrl('/verify-email', '/verify-email')
        return
      }

      // Check profile and role before redirecting
      hasRedirected.current = true
      setStatus('Redirecting...')

      try {
        const profilePromise = supabase
          .from('users')
          .select('role, company_id')
          .eq('id', userId)
          .single()

        // Give profile check 2s — if it responds quickly and user has no profile,
        // redirect to onboarding instead. Otherwise, just go to dashboard.
        const result = await Promise.race([
          profilePromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
        ])

        if (result && 'data' in result) {
          const { data: userProfile } = result
          if (!userProfile || !userProfile.role || !userProfile.company_id) {
            // New user (e.g. Google/Apple signup) — send to onboarding to create profile
            window.location.href = '/onboarding'
            return
          }

          // Check if driver needs activation
          if (userProfile.role === 'driver') {
            const { data: driverData } = await supabase
              .from('drivers')
              .select('is_active')
              .eq('user_id', userId)
              .single()

            if (driverData && !driverData.is_active) {
              window.location.href = '/pending-activation'
              return
            }
          }
        }

        // Best-effort role sync — don't await, don't block redirect
        authenticatedFetch('/api/sync-user-role').catch(() => {})
      } catch {
        // Profile check failed — still go to dashboard
      }

      window.location.href = '/dashboard'
    }

    // Shared code-exchange helper used by both URL params and deep link listener
    const exchangeCode = async (url: string) => {
      if (hasRedirected.current) return
      try {
        const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : url.split('#')[1] || '')
        const code = params.get('code')
        if (!code) return false

        setStatus('Verifying your email...')
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error && data.session) {
          await syncRoleAndRedirect(data.session.user.id, data.session.user.email_confirmed_at)
          return true
        }
        return false
      } catch {
        return false
      }
    }

    // === APPROACH 1: Listen for auth state changes ===
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Password recovery flow — redirect to update-password page
      if (event === 'PASSWORD_RECOVERY' && session) {
        if (!hasRedirected.current) {
          hasRedirected.current = true
          window.location.href = '/update-password'
        }
        return
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && session) {
        syncRoleAndRedirect(session.user.id, session.user.email_confirmed_at)
      }
    })

    // === APPROACH 2: Native deep link listener (Capacitor) ===
    // When a verification email link is clicked on mobile, iOS/Android opens the app
    // via the custom URL scheme. The auth code arrives here — NOT in window.location.
    let deepLinkListener: { remove: () => void } | null = null
    if (isNative) {
      App.addListener('appUrlOpen', async (event) => {
        const handled = await exchangeCode(event.url)
        if (!handled && !hasRedirected.current) {
          // Couldn't exchange — check if already has session (e.g. magic link flow)
          const { data } = await supabase.auth.getSession()
          if (data.session) {
            await syncRoleAndRedirect(data.session.user.id, data.session.user.email_confirmed_at)
          }
        }
      }).then(handle => { deepLinkListener = handle })
    }

    // === APPROACH 3: Check URL for tokens manually (fallback for web) ===
    const handleUrlTokens = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))

        const oauthError = searchParams.get('error') || hashParams.get('error')
        const errorDesc = searchParams.get('error_description') || hashParams.get('error_description')

        if (oauthError) {
          const decodedDesc = decodeURIComponent(errorDesc || '')

          // Detect expired/invalid email verification links
          if (oauthError === 'access_denied' && decodedDesc.toLowerCase().includes('expired')) {
            hasRedirected.current = true
            setExpiredLinkError(sanitizeDisplayParam(decodedDesc))
            setShowExpiredLink(true)
            return
          }

          setStatus(`Sign in failed: ${sanitizeDisplayParam(decodedDesc || oauthError)}`)
          setTimeout(() => {
            if (!hasRedirected.current) {
              hasRedirected.current = true
              // Sanitize URL params to prevent XSS / open redirect
              const safeError = encodeURIComponent(String(oauthError).slice(0, 100))
              window.location.href = validateRedirectUrl(`/login?error=${safeError}`, '/login')
            }
          }, 5000)
          return
        }

        // Check hash fragment (implicit flow)
        const hash = window.location.hash

        if (hash) {
          const innerHashParams = new URLSearchParams(hash.substring(1))
          const accessToken = innerHashParams.get('access_token')
          const refreshToken = innerHashParams.get('refresh_token')

          if (accessToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            })

            if (!error && data.session) {
              await syncRoleAndRedirect(data.session.user.id, data.session.user.email_confirmed_at)
              return
            }
          }
        }

        // Check query params for authorization code (PKCE flow - web)
        const code = searchParams.get('code')
        if (code) {
          const handled = await exchangeCode(window.location.href)
          if (handled) return

          // Code exchange failed — but onAuthStateChange (APPROACH 1) may have
          // already consumed the code and established a session. Check first.
          if (!isNative && !hasRedirected.current) {
            const { data: sessionData } = await supabase.auth.getSession()
            if (sessionData.session) {
              await syncRoleAndRedirect(sessionData.session.user.id, sessionData.session.user.email_confirmed_at)
              return
            }

            // No session — likely mobile-originated PKCE without verifier
            setShowAppRedirect(true)
            hasRedirected.current = true
            return
          }
        }

        // No tokens/code in URL — wait for auto-detection or deep link
      } catch (err: unknown) {
        console.error('URL token processing error:', err instanceof Error ? err.message : err)
      }
    }

    handleUrlTokens()

    // === APPROACH 4: Polling fallback ===
    // Use 3s interval (not 1s) and timeout-wrapped getSession() to avoid
    // flooding navigator.locks and causing contention on the dashboard page.
    const pollInterval = setInterval(async () => {
      if (hasRedirected.current) {
        clearInterval(pollInterval)
        return
      }

      try {
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 3000)
          ),
        ])
        if (data.session) {
          clearInterval(pollInterval)
          await syncRoleAndRedirect(data.session.user.id, data.session.user.email_confirmed_at)
        }
      } catch {
        // getSession timed out or threw — next poll will retry
      }
    }, 3000)

    // === TIMEOUT: Give up after 15 seconds ===
    const timeout = setTimeout(() => {
      if (hasRedirected.current) return
      clearInterval(pollInterval)

      setStatus('Authentication timed out. Please try again.')

      setTimeout(() => {
        if (!hasRedirected.current) {
          window.location.href = '/login?error=no_session'
        }
      }, 3000)
    }, 15000)

    return () => {
      subscription.unsubscribe()
      clearInterval(pollInterval)
      clearTimeout(timeout)
      deepLinkListener?.remove()
    }
  }, [router])


  // Show expired email link UI with resend option
  if (showExpiredLink) {
    return <ExpiredLinkView errorMessage={expiredLinkError} />
  }

  // Show "open the app" message when verification link is opened in system browser
  // (PKCE code_verifier is in app storage, can't complete verification from Safari)
  if (showAppRedirect) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 safe-area-p">
        <div className="text-center space-y-6 max-w-md px-4">
          <div className="mx-auto w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Continue in the App
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              It looks like you signed up using the Raute mobile app.
              Please open the app to complete your email verification.
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <a
              href="io.raute.app://auth/callback"
              className="inline-flex items-center justify-center w-full h-12 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
            >
              Open Raute App
            </a>
            <button
              onClick={() => window.location.href = '/login'}
              className="inline-flex items-center justify-center w-full h-12 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Sign in on web instead
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 safe-area-p">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="h-12 w-12 mx-auto animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <p className="text-slate-600 dark:text-slate-400">{status}</p>
      </div>
    </div>
  )
}

/**
 * Shown when user clicks an expired email verification link.
 * Allows them to enter their email and resend the verification.
 */
function ExpiredLinkView({ errorMessage }: { errorMessage: string }) {
  const [email, setEmail] = useState('')
  const [isResending, setIsResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [resendMessage, setResendMessage] = useState('')

  async function handleResend() {
    if (!email.trim()) return
    setIsResending(true)
    setResendStatus('idle')

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        if (error.message.includes('rate') || error.message.includes('limit') || error.status === 429) {
          setResendMessage('Please wait a moment before requesting another email.')
        } else {
          setResendMessage(error.message)
        }
        setResendStatus('error')
      } else {
        setResendMessage('A new verification email has been sent! Please check your inbox (and spam folder).')
        setResendStatus('success')
      }
    } catch {
      setResendMessage('Something went wrong. Please try again.')
      setResendStatus('error')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 safe-area-p">
      <div className="text-center space-y-6 max-w-md px-4">
        <div className="mx-auto w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Verification Link Expired
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {errorMessage || 'This email verification link has expired or is no longer valid.'}
          </p>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Enter your email below to receive a new verification link.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            className="w-full h-12 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleResend()}
          />

          {resendStatus === 'success' && (
            <div className="bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400 text-sm p-3 rounded-lg text-left">
              {resendMessage}
            </div>
          )}
          {resendStatus === 'error' && (
            <div className="bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400 text-sm p-3 rounded-lg text-left">
              {resendMessage}
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={isResending || !email.trim()}
            className="inline-flex items-center justify-center w-full h-12 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResending ? 'Sending...' : 'Resend Verification Email'}
          </button>
          <button
            onClick={() => window.location.href = '/login'}
            className="inline-flex items-center justify-center w-full h-12 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  )
}
