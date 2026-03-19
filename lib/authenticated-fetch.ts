import { supabase } from '@/lib/supabase'
import { Capacitor } from '@capacitor/core'

/**
 * Fetch wrapper that automatically includes the Supabase access token
 * in the Authorization header. Works for both web (cookies + header)
 * and native (header only).
 *
 * On native (Capacitor), API routes don't exist locally — they run on
 * the production server. So relative URLs like '/api/...' are prefixed
 * with the production base URL. Uses CapacitorHttp for the actual request
 * to bypass WebView CORS restrictions on cross-origin calls.
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

    // NATIVE FALLBACK: If getSession() returned no token (initializePromise
    // timed out or session not in client), read directly from Preferences.
    // On native, the token is always in Preferences even when the Supabase
    // client's internal session isn't initialized yet.
    if (!accessToken && typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        try {
            const { capacitorStorage } = await import('@/lib/capacitor-storage')
            const stored = await capacitorStorage.getItem('sb-raute-auth')
            if (stored) {
                const parsed = JSON.parse(stored)
                accessToken = parsed?.access_token
            }
        } catch {
            // Storage read failed — proceed without token
        }
    }

    // On native, API routes live on the production server, not locally.
    // Use CapacitorHttp to bypass WebView CORS restrictions.
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()

    if (isNative && url.startsWith('/')) {
        const { CapacitorHttp } = await import('@capacitor/core')
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.raute.io'
        const fullUrl = `${baseUrl}${url}`

        const headersObj: Record<string, string> = {}
        if (accessToken) headersObj['Authorization'] = `Bearer ${accessToken}`
        if (options.body) headersObj['Content-Type'] = 'application/json'

        // Merge any custom headers from options
        if (options.headers) {
            const h = new Headers(options.headers)
            h.forEach((value, key) => { headersObj[key] = value })
        }

        const response = await CapacitorHttp.request({
            url: fullUrl,
            method: (options.method || 'GET').toUpperCase(),
            headers: headersObj,
            data: options.body ? JSON.parse(options.body as string) : undefined,
        })

        // Convert CapacitorHttp response to a fetch-compatible Response
        return new Response(JSON.stringify(response.data), {
            status: response.status,
            headers: response.headers,
        })
    }

    // Web: use standard fetch with cookies
    const headers = new Headers(options.headers)
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`)
    }
    if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json')
    }

    return fetch(url, {
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
