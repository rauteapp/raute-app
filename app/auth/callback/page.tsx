"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

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
        window.location.href = '/verify-email'
        return
      }

      setStatus('Setting up your account...')

      // Check if user has a complete profile (role + company)
      // Wrap in a timeout so we don't hang forever if the DB query is slow
      try {
        const profileCheck = async (): Promise<boolean> => {
          const { data: userProfile } = await supabase
            .from('users')
            .select('role, company_id')
            .eq('id', userId)
            .single()

          if (!userProfile || !userProfile.role || !userProfile.company_id) {
            console.warn('⚠️ User has no complete profile, redirecting to login')
            hasRedirected.current = true
            window.location.href = '/login?message=verified'
            return false
          }

          // Sync role from DB to session metadata (best-effort, don't block redirect)
          try { await authenticatedFetch('/api/sync-user-role') } catch {}
          return true
        }

        // 8s timeout — if profile check hangs, still redirect to dashboard
        const result = await Promise.race([
          profileCheck(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 8000))
        ])

        if (hasRedirected.current) return // profileCheck redirected to /login
      } catch {
        // If profile check fails, still try to go to dashboard
      }

      if (hasRedirected.current) return
      hasRedirected.current = true
      setStatus('Redirecting to dashboard...')
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
        console.warn('Code exchange failed:', error?.message)
        return false
      } catch {
        return false
      }
    }

    // === APPROACH 1: Listen for auth state changes ===
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
        console.log('🔗 Deep link received:', event.url)
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
            setExpiredLinkError(decodedDesc)
            setShowExpiredLink(true)
            return
          }

          setStatus(`Sign in failed: ${decodedDesc || oauthError}`)
          setTimeout(() => {
            if (!hasRedirected.current) {
              hasRedirected.current = true
              window.location.href = `/login?error=${oauthError}`
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

          // Code exchange failed on web — likely mobile-originated PKCE without verifier
          if (!isNative) {
            console.warn('Code exchange failed (likely missing PKCE verifier from mobile signup):', code)
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
    const pollInterval = setInterval(async () => {
      if (hasRedirected.current) {
        clearInterval(pollInterval)
        return
      }

      const { data } = await supabase.auth.getSession()
      if (data.session) {
        clearInterval(pollInterval)
        await syncRoleAndRedirect(data.session.user.id, data.session.user.email_confirmed_at)
      }
    }, 1000)

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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
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
