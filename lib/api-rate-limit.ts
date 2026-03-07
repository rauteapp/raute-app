import { NextResponse } from 'next/server'
import { RateLimiter } from './rate-limiter'

/**
 * Cache of RateLimiter instances keyed by "window:max" so each
 * unique configuration shares a single limiter (and its Map).
 */
const limiters = new Map<string, RateLimiter>()

function getLimiter(windowSeconds: number, maxRequests: number): RateLimiter {
    const key = `${windowSeconds}:${maxRequests}`
    let limiter = limiters.get(key)
    if (!limiter) {
        limiter = new RateLimiter(windowSeconds, maxRequests)
        limiters.set(key, limiter)
    }
    return limiter
}

/**
 * Extract the client IP address from the request headers.
 * Works with Vercel, Cloudflare, and standard proxies.
 */
function getClientIp(request: Request): string {
    const headers = request.headers

    // Vercel / common proxies
    const forwarded = headers.get('x-forwarded-for')
    if (forwarded) {
        return forwarded.split(',')[0].trim()
    }

    // Cloudflare
    const cfIp = headers.get('cf-connecting-ip')
    if (cfIp) return cfIp

    // Vercel-specific
    const realIp = headers.get('x-real-ip')
    if (realIp) return realIp

    return 'unknown'
}

interface RateLimitOptions {
    windowSeconds: number
    maxRequests: number
}

/**
 * Check rate limit for an API route. Returns null if the request is allowed,
 * or a 429 NextResponse if the client has exceeded the limit.
 *
 * Usage:
 * ```ts
 * const rateLimited = checkRateLimit(request, { windowSeconds: 60, maxRequests: 10 })
 * if (rateLimited) return rateLimited
 * ```
 */
export function checkRateLimit(
    request: Request,
    options: RateLimitOptions
): NextResponse | null {
    const ip = getClientIp(request)
    const limiter = getLimiter(options.windowSeconds, options.maxRequests)
    const result = limiter.check(ip)

    if (!result.success) {
        return NextResponse.json(
            {
                error: 'Too many requests',
                retryAfter: result.resetIn,
            },
            {
                status: 429,
                headers: {
                    'Retry-After': String(result.resetIn),
                    'X-RateLimit-Limit': String(options.maxRequests),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': String(result.resetIn),
                },
            }
        )
    }

    return null
}
