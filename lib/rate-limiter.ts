/**
 * Simple in-memory rate limiter using a sliding window approach.
 * Stores request counts per key (typically IP address) in a Map.
 * Automatically cleans up expired entries on each check.
 */

interface RateLimitEntry {
    count: number
    resetAt: number // timestamp in ms
}

interface RateLimitResult {
    success: boolean
    remaining: number
    resetIn: number // seconds until window resets
}

export class RateLimiter {
    private store = new Map<string, RateLimitEntry>()
    private windowMs: number
    private maxRequests: number

    constructor(windowSeconds: number, maxRequests: number) {
        this.windowMs = windowSeconds * 1000
        this.maxRequests = maxRequests
    }

    /**
     * Check if a request from the given key should be allowed.
     * Increments the counter and returns the result.
     */
    check(key: string): RateLimitResult {
        const now = Date.now()

        // Clean up expired entries periodically (every check, lightweight)
        this.cleanup(now)

        const entry = this.store.get(key)

        // No existing entry or window has expired — start fresh
        if (!entry || now >= entry.resetAt) {
            this.store.set(key, {
                count: 1,
                resetAt: now + this.windowMs,
            })
            return {
                success: true,
                remaining: this.maxRequests - 1,
                resetIn: Math.ceil(this.windowMs / 1000),
            }
        }

        // Within the window — check if under limit
        if (entry.count < this.maxRequests) {
            entry.count++
            return {
                success: true,
                remaining: this.maxRequests - entry.count,
                resetIn: Math.ceil((entry.resetAt - now) / 1000),
            }
        }

        // Over the limit
        return {
            success: false,
            remaining: 0,
            resetIn: Math.ceil((entry.resetAt - now) / 1000),
        }
    }

    /**
     * Remove entries whose window has expired to prevent memory leaks.
     */
    private cleanup(now: number) {
        // Only clean up if the store has grown beyond a reasonable size
        if (this.store.size > 1000) {
            for (const [key, entry] of this.store) {
                if (now >= entry.resetAt) {
                    this.store.delete(key)
                }
            }
        }
    }
}
