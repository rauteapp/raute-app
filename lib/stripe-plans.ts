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
 * For founding member pricing (50% off), create separate prices in Stripe
 * with coupons or use the founding member price IDs:
 *
 * STRIPE_PRICE_STARTER_MONTHLY_FOUNDING=price_xxx
 * STRIPE_PRICE_PRO_MONTHLY_FOUNDING=price_xxx
 * STRIPE_PRICE_PIONEER_MONTHLY_FOUNDING=price_xxx
 * (etc.)
 */

export interface StripePlan {
    id: string
    name: string
    driverLimit: number
    orderLimit: number
    priceId: string
    foundingPriceId?: string
}

export function getStripePlans(billingCycle: 'monthly' | 'annual', useFoundingPricing: boolean): StripePlan[] {
    const suffix = billingCycle === 'annual' ? '_ANNUAL' : '_MONTHLY'
    const foundingSuffix = suffix + '_FOUNDING'

    return [
        {
            id: 'starter',
            name: 'Starter',
            driverLimit: 5,
            orderLimit: 500,
            priceId: process.env[`STRIPE_PRICE_STARTER${suffix}`] || '',
            foundingPriceId: useFoundingPricing ? process.env[`STRIPE_PRICE_STARTER${foundingSuffix}`] : undefined,
        },
        {
            id: 'pro',
            name: 'Pro',
            driverLimit: 15,
            orderLimit: 2000,
            priceId: process.env[`STRIPE_PRICE_PRO${suffix}`] || '',
            foundingPriceId: useFoundingPricing ? process.env[`STRIPE_PRICE_PRO${foundingSuffix}`] : undefined,
        },
        {
            id: 'pioneer',
            name: 'Pioneer',
            driverLimit: 40,
            orderLimit: 10000,
            priceId: process.env[`STRIPE_PRICE_PIONEER${suffix}`] || '',
            foundingPriceId: useFoundingPricing ? process.env[`STRIPE_PRICE_PIONEER${foundingSuffix}`] : undefined,
        },
    ]
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
        for (const suffix of ['_MONTHLY', '_ANNUAL', '_MONTHLY_FOUNDING', '_ANNUAL_FOUNDING']) {
            const envKey = `STRIPE_PRICE_${plan.key}${suffix}`
            const id = process.env[envKey]
            if (id) {
                mappings[id] = { drivers: plan.drivers, orders: plan.orders }
            }
        }
    }

    return mappings[priceId] || null
}
