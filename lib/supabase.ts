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
        console.log('🔧 Creating Supabase client for NATIVE platform')
        // Native platform (iOS/Android) — use standard client with Capacitor storage
        // This avoids the cookie-based auth flow that createBrowserClient uses
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
            // Add global error handler
            global: {
                headers: {
                    'x-client-info': 'raute-app-ios',
                }
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

        return client
    }

    console.log('🔧 Creating Supabase client for WEB platform')
    // Web browser — use SSR-compatible browser client (cookie-based)
    // IMPORTANT: Do NOT use capacitorStorage here — createBrowserClient
    // uses cookies for session storage, which the middleware reads via createServerClient.
    // Using custom storage breaks the cookie-based SSR auth flow.
    // CRITICAL: Set cookieOptions with maxAge so cookies persist across browser restarts.
    // Without this, createBrowserClient sets session cookies (no maxAge) via document.cookie,
    // which get cleared when the browser closes — even if the middleware sets maxAge on the
    // server side, the client overwrites them without it.
    const client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: {
            maxAge: 365 * 24 * 60 * 60, // 1 year — let Supabase Auth control session validity
            path: '/',
            sameSite: 'lax' as const,
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
    // Fix: Use a 2-second timeout on navigator.locks. If the lock can't be
    // acquired within 2s (e.g. another tab is refreshing), proceed without it.
    // The risk of concurrent token refresh is low and recoverable (server rejects
    // stale refresh tokens gracefully — user just needs to refresh the page).
    const webAuth = client.auth as any
    const originalAcquireLock = webAuth._acquireLock?.bind(webAuth)
    if (originalAcquireLock) {
        webAuth._acquireLock = async function (acquireTimeout: number, fn: () => Promise<any>) {
            if (typeof navigator !== 'undefined' && navigator.locks) {
                try {
                    const lockName = 'sb-' + supabaseUrl.split('//')[1]?.split('.')[0] + '-auth-token'
                    return await Promise.race([
                        navigator.locks.request(lockName, { mode: 'exclusive' }, async () => fn()),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('lock-timeout')), 2000)
                        ),
                    ])
                } catch (err: any) {
                    if (err?.message === 'lock-timeout') {
                        console.warn('⚠️ navigator.locks timeout — proceeding without lock')
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
export const supabaseAdmin = supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : (() => {
        // Warn loudly if service role key is missing — admin operations will fail with RLS
        if (typeof window === 'undefined') {
            console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY is not set! Admin operations will use anon client and may fail due to RLS.')
        }
        return supabase
    })()

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
