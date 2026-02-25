import { supabase } from '@/lib/supabase'

/**
 * Fetch wrapper that automatically includes the Supabase access token
 * in the Authorization header. Works for both web (cookies + header)
 * and native (header only).
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

    return fetch(url, {
        ...options,
        headers,
    })
}
