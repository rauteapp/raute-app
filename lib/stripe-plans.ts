/**
 * Stripe plan configuration.
 *
 * After creating products + prices in Stripe Dashboard, set these env vars:
 *
 * STRIPE_PRICE_STARTER_MONTHLY=price_xxx
 * STRIPE_PRICE_STARTER_ANNUAL=price_xxx
 * STRIPE_PRICE_PRO_MONTHLY=price_xxx
 * STRIPE_PRICE_PRO_ANNUAL=price_xxx
 * STRIPE_PRICE_PIONEER_MONTHLY=price_xxx
 * STRIPE_PRICE_PIONEER_ANNUAL=price_xxx
 *
 * For founding member pricing, a Stripe coupon is used (50% off for 12 months).
 * The coupon is applied at checkout — no separate founding price IDs needed.
 *
 * STRIPE_FOUNDING_COUPON_ID=bKlrEpZr (live) or oa2b4KLK (test)
 */

export interface StripePlan {
    id: string
    name: string
    driverLimit: number
    orderLimit: number
    priceId: string
}

export function getStripePlans(billingCycle: 'monthly' | 'annual'): StripePlan[] {
    const suffix = billingCycle === 'annual' ? '_ANNUAL' : '_MONTHLY'

    return [
        {
            id: 'starter',
            name: 'Starter',
            driverLimit: 5,
            orderLimit: 500,
            priceId: process.env[`STRIPE_PRICE_STARTER${suffix}`] || '',
        },
        {
            id: 'pro',
            name: 'Pro',
            driverLimit: 15,
            orderLimit: 2000,
            priceId: process.env[`STRIPE_PRICE_PRO${suffix}`] || '',
        },
        {
            id: 'pioneer',
            name: 'Pioneer',
            driverLimit: 40,
            orderLimit: 10000,
            priceId: process.env[`STRIPE_PRICE_PIONEER${suffix}`] || '',
        },
    ]
}

/**
 * Get the founding member coupon ID from env.
 * This is a Stripe coupon that gives 50% off for 12 months.
 */
export function getFoundingCouponId(): string | null {
    return process.env.STRIPE_FOUNDING_COUPON_ID || null
}

// Same limits map used by Stripe webhook (maps Stripe price IDs → limits)
export function getLimitsForPriceId(priceId: string): { drivers: number; orders: number } | null {
    // Build a reverse map from all env vars
    const mappings: Record<string, { drivers: number; orders: number }> = {}
    const plans = [
        { drivers: 5, orders: 500, key: 'STARTER' },
        { drivers: 15, orders: 2000, key: 'PRO' },
        { drivers: 40, orders: 10000, key: 'PIONEER' },
    ]

    for (const plan of plans) {
        for (const suffix of ['_MONTHLY', '_ANNUAL']) {
            const envKey = `STRIPE_PRICE_${plan.key}${suffix}`
            const id = process.env[envKey]
            if (id) {
                mappings[id] = { drivers: plan.drivers, orders: plan.orders }
            }
        }
    }

    return mappings[priceId] || null
}
