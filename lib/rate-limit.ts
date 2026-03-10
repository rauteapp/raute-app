/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding window approach with automatic cleanup.
 *
 * Note: This is per-instance (resets on deploy/restart).
 * For production-scale rate limiting, consider Upstash Redis.
 */

interface RateLimitEntry {
    timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 5 * 60 * 1000

function cleanup(windowMs: number) {
    const now = Date.now()
    if (now - lastCleanup < CLEANUP_INTERVAL) return
    lastCleanup = now

    const cutoff = now - windowMs
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter(t => t > cutoff)
        if (entry.timestamps.length === 0) {
            store.delete(key)
        }
    }
}

interface RateLimitConfig {
    /** Max requests allowed in the window */
    limit: number
    /** Window duration in milliseconds */
    windowMs: number
}

interface RateLimitResult {
    success: boolean
    limit: number
    remaining: number
    resetMs: number
}

/**
 * Check rate limit for a given key (usually IP or user ID).
 */
export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now()
    const cutoff = now - config.windowMs

    cleanup(config.windowMs)

    let entry = store.get(key)
    if (!entry) {
        entry = { timestamps: [] }
        store.set(key, entry)
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter(t => t > cutoff)

    if (entry.timestamps.length >= config.limit) {
        const oldestInWindow = entry.timestamps[0]
        return {
            success: false,
            limit: config.limit,
            remaining: 0,
            resetMs: oldestInWindow + config.windowMs - now,
        }
    }

    entry.timestamps.push(now)

    return {
        success: true,
        limit: config.limit,
        remaining: config.limit - entry.timestamps.length,
        resetMs: config.windowMs,
    }
}

/**
 * Extract client IP from request headers.
 * Works with Vercel, Cloudflare, and standard proxies.
 */
export function getClientIp(request: Request): string {
    return (
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        request.headers.get('cf-connecting-ip') ||
        'unknown'
    )
}

// Pre-configured rate limit configs for different route types
export const RATE_LIMITS = {
    /** AI endpoints — expensive, 10 req/min per IP */
    ai: { limit: 10, windowMs: 60 * 1000 },
    /** Contact form — 5 req/min per IP */
    contact: { limit: 5, windowMs: 60 * 1000 },
    /** Stripe checkout — 10 req/min per IP */
    checkout: { limit: 10, windowMs: 60 * 1000 },
    /** Account deletion — 3 req/hour per IP */
    deleteAccount: { limit: 3, windowMs: 60 * 60 * 1000 },
} as const

/**
 * Helper: apply rate limit and return 429 response if exceeded.
 * Returns null if allowed, or a NextResponse if blocked.
 */
export function applyRateLimit(
    request: Request,
    configKey: keyof typeof RATE_LIMITS
): Response | null {
    const ip = getClientIp(request)
    const config = RATE_LIMITS[configKey]
    const result = rateLimit(`${configKey}:${ip}`, config)

    if (!result.success) {
        return new Response(
            JSON.stringify({
                error: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil(result.resetMs / 1000),
            }),
            {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': String(Math.ceil(result.resetMs / 1000)),
                    'X-RateLimit-Limit': String(result.limit),
                    'X-RateLimit-Remaining': '0',
                },
            }
        )
    }

    return null
}
