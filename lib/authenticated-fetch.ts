import { supabase } from '@/lib/supabase'
import { Capacitor } from '@capacitor/core'

/**
 * Fetch wrapper that automatically includes the Supabase access token
 * in the Authorization header. Works for both web (cookies + header)
 * and native (header only).
 *
 * On native (Capacitor), API routes don't exist locally — they run on
 * the production server. So relative URLs like '/api/...' are prefixed
 * with the production base URL.
 *
 * Uses a timeout on getSession() to avoid hanging when navigator.locks
 * is blocked by a token refresh on web. Falls back to getUser() if needed.
 */
export async function authenticatedFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    let accessToken: string | undefined

    try {
        // getSession() can hang on web due to navigator.locks contention.
        // Apply a 3s timeout — if it blocks, fall back to making the request
        // without the token (web has cookies, so the request may still succeed).
        const { data } = await Promise.race([
            supabase.auth.getSession(),
            new Promise<{ data: { session: null } }>((resolve) =>
                setTimeout(() => resolve({ data: { session: null } }), 3000)
            ),
        ])
        accessToken = data.session?.access_token
    } catch {
        // getSession() threw (AbortError, etc.) — proceed without token
    }

    const headers = new Headers(options.headers)
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`)
    }
    if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json')
    }

    // On native, API routes live on the production server, not locally
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()
    const baseUrl = isNative && url.startsWith('/')
        ? (process.env.NEXT_PUBLIC_APP_URL || 'https://www.raute.io')
        : ''

    return fetch(`${baseUrl}${url}`, {
        ...options,
        headers,
    })
}

/**
 * Get the API base URL. On native (Capacitor), API routes run on the
 * production server, not locally. On web, use relative URLs.
 */
export function getApiBaseUrl(): string {
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        return process.env.NEXT_PUBLIC_APP_URL || 'https://www.raute.io'
    }
    return ''
}
