import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { capacitorStorage } from './capacitor-storage'
import { Capacitor } from '@capacitor/core'

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Detect if running on native platform (iOS/Android)
const isNativePlatform = typeof window !== 'undefined' && Capacitor.isNativePlatform()

// Create Supabase client with platform-appropriate configuration
// CRITICAL FIX: On native platforms, use createClient (not createBrowserClient)
// createBrowserClient is designed for cookie-based SSR auth which doesn't work on Capacitor
// because there's no server to set/read cookies. On native, we use capacitorStorage
// (Capacitor Preferences API) for session persistence instead.
function createSupabaseClient() {
    if (typeof window === 'undefined') {
        // Server-side rendering — no session needed
        return createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: false,
            }
        })
    }

    if (isNativePlatform) {
        // Native platform (iOS/Android) — use standard client with Capacitor storage
        // This avoids the cookie-based auth flow that createBrowserClient uses
        //
        // CRITICAL: Provide a custom fetch that uses CapacitorHttp on native.
        // The automatic fetch patching from CapacitorHttp doesn't work reliably
        // with Supabase's auth headers (Authorization, apikey) which trigger
        // CORS preflight requests that the interceptor can't handle.
        const nativeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            try {
                const { CapacitorHttp } = await import('@capacitor/core')
                const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
                const method = init?.method || 'GET'
                const headers: Record<string, string> = {}

                if (init?.headers) {
                    if (init.headers instanceof Headers) {
                        init.headers.forEach((value, key) => { headers[key] = value })
                    } else if (Array.isArray(init.headers)) {
                        init.headers.forEach(([key, value]) => { headers[key] = value })
                    } else {
                        Object.assign(headers, init.headers)
                    }
                }

                let data: any = undefined
                if (init?.body) {
                    try {
                        data = JSON.parse(init.body as string)
                    } catch {
                        data = init.body
                    }
                }

                const response = await CapacitorHttp.request({
                    url,
                    method,
                    headers,
                    data,
                })

                // Convert CapacitorHttp response to standard Response
                const responseBody = typeof response.data === 'string'
                    ? response.data
                    : JSON.stringify(response.data)

                return new Response(responseBody, {
                    status: response.status,
                    headers: response.headers,
                })
            } catch (err) {
                // Fallback to regular fetch if CapacitorHttp fails
                return fetch(input, init)
            }
        }

        const client = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                storage: capacitorStorage,
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: false, // Deep links handled by AuthListener
                flowType: 'pkce', // PKCE flow — code verifier backed up manually in login page
                debug: false, // Set to true for debugging
                // Add storage key to avoid conflicts
                storageKey: 'sb-raute-auth',
            },
            global: {
                headers: {
                    'x-client-info': 'raute-app-ios',
                },
                fetch: nativeFetch,
            }
        })

        // CRITICAL: Monkey-patch _acquireLock on native (Capacitor).
        //
        // Supabase's _acquireLock has TWO locking mechanisms:
        // 1. navigator.locks (Web Locks API) — for cross-tab coordination
        // 2. pendingInLock queue — for serializing operations within a tab
        //
        // On Capacitor there's only ONE WebView (no tabs), so #1 is unnecessary.
        // More critically, exchangeCodeForSession() hangs on Capacitor iOS:
        // the HTTP call succeeds, session is saved internally, SIGNED_IN fires,
        // but the promise NEVER resolves. This leaves a hanging promise in the
        // pendingInLock queue. All subsequent auth operations (getSession,
        // setSession, refreshSession) queue behind it and hang forever.
        //
        // Even a no-op lock function doesn't fix this because _acquireLock's
        // internal queue (pendingInLock) still serializes behind the hung promise.
        //
        // Solution: Replace _acquireLock entirely with a simple pass-through
        // that just calls fn() without any queuing or lock coordination.
        const auth = client.auth as any
        auth._acquireLock = async function (_acquireTimeout: number, fn: () => Promise<any>) {
            return await fn()
        }

        // CRITICAL: Timeout initializePromise to prevent total client deadlock.
        //
        // _initialize() runs on client creation and reads the session from
        // capacitorStorage. If the stored access_token is expired, it attempts
        // an HTTP token refresh. On Capacitor iOS, this HTTP call can hang
        // indefinitely. Since EVERY Supabase operation — getSession(), getUser(),
        // refreshSession(), and even .from().select() via _getAccessToken() —
        // awaits initializePromise before proceeding, a hung _initialize()
        // deadlocks the entire client.
        //
        // Solution: Race initializePromise with a 3-second timeout. If init
        // hasn't completed by then, unblock all operations. The waitForSession()
        // helper will handle manual recovery (read tokens from Preferences +
        // refreshSession) if the client has no session after the timeout.
        const originalInitPromise = auth.initializePromise
        if (originalInitPromise) {
            auth.initializePromise = Promise.race([
                originalInitPromise,
                new Promise<void>((resolve) => setTimeout(() => {
                    console.warn('⏱️ Supabase _initialize() timed out (3s) — unblocking auth operations')
                    resolve()
                }, 3000))
            ])
        }

        return client
    }

    // Web browser — use SSR-compatible browser client (cookie-based)
    // IMPORTANT: Do NOT use capacitorStorage here — createBrowserClient
    // uses cookies for session storage, which the middleware reads via createServerClient.
    // Using custom storage breaks the cookie-based SSR auth flow.
    // CRITICAL: Set cookieOptions with maxAge so cookies persist across browser restarts.
    // Without this, createBrowserClient sets session cookies (no maxAge) via document.cookie,
    // which get cleared when the browser closes — even if the middleware sets maxAge on the
    // server side, the client overwrites them without it.
    // Set domain to .raute.io so cookies work on both raute.io and www.raute.io.
    // Without this, logging in on raute.io sets cookies only for that exact host,
    // and visiting www.raute.io sends no cookies — causing session loss.
    const isRaute = typeof window !== 'undefined' && window.location.hostname.endsWith('raute.io')
    const client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: {
            maxAge: 365 * 24 * 60 * 60, // 1 year — let Supabase Auth control session validity
            path: '/',
            sameSite: 'lax' as const,
            ...(isRaute ? { domain: '.raute.io' } : {}),
        }
    })

    // CRITICAL: Monkey-patch _acquireLock on web to prevent navigator.locks hangs.
    //
    // Supabase's GoTrueClient uses navigator.locks (Web Locks API) to coordinate
    // token refreshes across browser tabs. However, when a token refresh is in
    // progress, ALL subsequent getSession() calls queue behind the lock and can
    // hang for 10+ seconds or indefinitely. This causes:
    // - Dashboard "Connection Timeout" errors
    // - Endless skeleton loaders
    // - "Lock busy / getSession timeout" cascades
    //
    // Fix: Use a 4-second timeout on navigator.locks. If the lock can't be
    // acquired within 4s (e.g. another tab is refreshing), proceed without it.
    // The risk of concurrent token refresh is low and recoverable (server rejects
    // stale refresh tokens gracefully — user just needs to refresh the page).
    const webAuth = client.auth as any
    const originalAcquireLock = webAuth._acquireLock?.bind(webAuth)
    let lockTimeoutCount = 0
    if (originalAcquireLock) {
        webAuth._acquireLock = async function (acquireTimeout: number, fn: () => Promise<any>) {
            if (typeof navigator !== 'undefined' && navigator.locks) {
                try {
                    const lockName = 'sb-' + supabaseUrl.split('//')[1]?.split('.')[0] + '-auth-token'
                    return await Promise.race([
                        navigator.locks.request(lockName, { mode: 'exclusive' }, async () => fn()),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('lock-timeout')), 4000)
                        ),
                    ])
                } catch (err: any) {
                    if (err?.message === 'lock-timeout') {
                        lockTimeoutCount++
                        return await fn()
                    }
                    throw err
                }
            }
            return await fn()
        }
    }

    return client
}

export const supabase = createSupabaseClient()

// Create Admin Client (Server-side only, uses Service Role Key)
// ⚠️ NEVER expose this client or the Service Role Key to the browser
// Uses lazy initialization to avoid throwing at module-level during static builds
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
    get(_, prop) {
        if (prop === 'then' || prop === Symbol.toPrimitive || prop === Symbol.toStringTag) {
            return undefined
        }
        // Client-side: never allow admin client usage
        if (typeof window !== 'undefined') {
            throw new Error('supabaseAdmin is not available on the client side.')
        }
        // Server-side: lazily create the real client on first use
        if (!_supabaseAdmin) {
            if (!supabaseServiceRoleKey) {
                throw new Error(
                    'SUPABASE_SERVICE_ROLE_KEY is not set! Cannot create supabaseAdmin client. ' +
                    'Admin operations require the service role key to bypass RLS safely.'
                )
            }
            _supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
                auth: { autoRefreshToken: false, persistSession: false }
            })
        }
        return (_supabaseAdmin as any)[prop]
    }
})

// Database Types (for TypeScript)
export type Company = {
    id: string
    name: string
    created_at: string
    updated_at: string
}

export type User = {
    id: string
    company_id: string
    email: string
    full_name: string
    role: 'admin' | 'manager' | 'driver' | 'dispatcher'
    status?: 'active' | 'suspended'
    permissions?: Record<string, boolean>
    created_at: string
    updated_at: string
}

export type Driver = {
    id: string
    company_id: string
    user_id: string | null
    name: string
    phone: string | null
    vehicle_type: string | null
    status: 'active' | 'inactive'
    is_online?: boolean
    custom_values?: Record<string, any>
    default_start_address?: string | null
    default_start_lat?: number | null
    default_start_lng?: number | null
    starting_point_lat?: number | null
    starting_point_lng?: number | null
    starting_point_address?: string | null
    use_manual_start?: boolean
    current_lat?: number | null
    current_lng?: number | null
    last_location_update?: string | null
    max_orders?: number | null
    vehicle_capacity_lbs?: number | null
    shift_start?: string | null  // HH:MM:SS
    shift_end?: string | null    // HH:MM:SS
    created_at: string
    updated_at: string
    email?: string // Added for UI display
}

export type CustomField = {
    id: string
    company_id: string
    entity_type: 'order' | 'driver'
    field_name: string
    field_type: 'text' | 'number' | 'date' | 'select' | 'textarea'
    field_label: string
    placeholder?: string
    options?: string[] // For select type
    is_required: boolean
    driver_visible: boolean // Show to drivers by default?
    display_order: number
    created_at: string
    updated_at: string
}

export type Order = {
    id: string
    company_id: string
    driver_id: string | null
    order_number: string
    customer_name: string
    address: string
    city: string | null
    state: string | null
    zip_code: string | null
    phone: string | null
    delivery_date: string | null
    status: 'pending' | 'assigned' | 'in_progress' | 'delivered' | 'cancelled'
    priority: number
    priority_level?: 'normal' | 'high' | 'critical'
    is_pinned?: boolean
    notes: string | null
    latitude: number | null
    longitude: number | null
    custom_fields: Record<string, any> // Dynamic custom field values
    driver_visible_overrides: string[] // Field IDs to show to driver for this order
    route_index?: number | null
    pin_reason?: string
    assigned_at?: string // For route sequencing (1, 2, 3...)
    // locked_to_driver removed in favor of is_pinned
    time_window_start?: string | null // HH:MM:SS
    time_window_end?: string | null // HH:MM:SS
    delivered_at: string | null
    geocoding_confidence?: 'exact' | 'approximate' | 'low' | 'failed'
    geocoded_address?: string
    geocoding_attempted_at?: string
    created_at: string
    updated_at: string
    proof_url?: string | null
    signature_url?: string | null
    signature_required?: boolean
    was_out_of_range?: boolean
    delivery_distance_meters?: number
    delivered_lat?: number | null
    delivered_lng?: number | null
    cancellation_reason?: string | null
    cancellation_note?: string | null
    cancelled_by?: string | null
    cancelled_at?: string | null
    weight_lbs?: number | null
    customer_email?: string | null
    tracking_token?: string | null
}

export type CompanySettings = {
    id: string
    company_id: string
    weight_tracking_enabled: boolean
    customer_tracking_enabled: boolean
    customer_email_notifications: boolean
    created_at: string
    updated_at: string
}

export type ProofImage = {
    id: string
    order_id: string
    company_id: string
    image_url: string
    uploaded_at: string
    uploaded_by: string | null
    created_at: string
}

export type DriverActivityLog = {
    id: string
    driver_id: string
    status: 'online' | 'offline' | 'working'
    timestamp: string
    metadata: any
}

export type Permission = 'create_orders' | 'delete_orders' | 'view_drivers' | 'manage_drivers' | 'view_map' | 'access_settings'
