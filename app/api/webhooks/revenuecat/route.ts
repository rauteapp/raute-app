import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * RevenueCat Webhook Handler
 * Processes subscription events and updates driver_limit + order_limit
 */

// Map product ID → { drivers, orders }
const planLimits: Record<string, { drivers: number; orders: number }> = {
    'raute_starter_monthly': { drivers: 5, orders: 500 },
    'raute_starter_annual': { drivers: 5, orders: 500 },
    'raute_pro_monthly': { drivers: 15, orders: 2000 },
    'raute_pro_annual': { drivers: 15, orders: 2000 },
    'raute_pioneer_monthly': { drivers: 40, orders: 10000 },
    'raute_pioneer_annual': { drivers: 40, orders: 10000 },
}

// Trial defaults (used on cancellation/expiration)
const TRIAL_DEFAULTS = { drivers: 5, orders: 500 }

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('authorization')
        const expectedToken = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN
        if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        const payload = await request.json()

        const {
            event: {
                type: eventType,
                id: eventId,
                app_user_id: userId,
                product_id: productId,
            }
        } = payload

        console.log(`RevenueCat Webhook: ${eventType}`, { userId, productId, eventId })

        // Reject anonymous RevenueCat IDs — they can't match our DB
        if (userId?.startsWith('$RCAnonymousID:')) {
            console.error('RevenueCat Webhook: Received anonymous user ID, cannot process:', userId)
            await supabaseAdmin.from('revenuecat_webhook_log').insert({
                event_id: eventId,
                event_type: eventType,
                user_id: userId,
                payload,
                status: 'error_anonymous_id'
            })
            return NextResponse.json({ status: 'error', message: 'Anonymous user ID cannot be processed' }, { status: 400 })
        }

        // Idempotency check
        const { data: existingEvent } = await supabaseAdmin
            .from('revenuecat_webhook_log')
            .select('event_id')
            .eq('event_id', eventId)
            .single()

        if (existingEvent) {
            return NextResponse.json({ status: 'duplicate', message: 'Event already processed' })
        }

        // Verify user exists in DB
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id, driver_limit, order_limit')
            .eq('id', userId)
            .single()

        if (!existingUser) {
            console.error('RevenueCat Webhook: User not found in DB:', userId)
            await supabaseAdmin.from('revenuecat_webhook_log').insert({
                event_id: eventId, event_type: eventType, user_id: userId, payload, status: 'error_user_not_found'
            })
            return NextResponse.json({ status: 'error', message: 'User not found' }, { status: 404 })
        }

        const limits = planLimits[productId] || { drivers: TRIAL_DEFAULTS.drivers, orders: TRIAL_DEFAULTS.orders }

        // ACTIVATE: purchase, renewal, uncancellation, plan change
        if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE'].includes(eventType)) {
            // Update user limits
            const { error: updateError } = await supabaseAdmin
                .from('users')
                .update({
                    driver_limit: limits.drivers,
                    order_limit: limits.orders,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)

            if (updateError) {
                console.error('RevenueCat Webhook: Failed to update user:', updateError)
                throw updateError
            }

            // Log the event
            await supabaseAdmin.from('revenuecat_webhook_log').insert({
                event_id: eventId, event_type: eventType, user_id: userId, payload, status: 'processed'
            })

            // Close any existing active subscription before creating new one (handles upgrades)
            await supabaseAdmin
                .from('subscription_history')
                .update({ ended_at: new Date().toISOString(), is_active: false })
                .eq('user_id', userId)
                .eq('is_active', true)

            // Create new subscription record
            await supabaseAdmin.from('subscription_history').insert({
                user_id: userId,
                tier_name: productId,
                driver_limit: limits.drivers,
                is_active: true,
                revenue_cat_subscription_id: payload.event?.subscriber_attributes?.['$revenuecat_id']
            })

            // Increment founding member counter on initial purchase
            if (eventType === 'INITIAL_PURCHASE') {
                const { data: config } = await supabaseAdmin
                    .from('app_config')
                    .select('value')
                    .eq('key', 'founding_members')
                    .single()

                if (config?.value?.active && config.value.count < config.value.limit) {
                    await supabaseAdmin
                        .from('app_config')
                        .update({
                            value: {
                                ...config.value,
                                count: config.value.count + 1,
                                active: (config.value.count + 1) < config.value.limit
                            },
                            updated_at: new Date().toISOString()
                        })
                        .eq('key', 'founding_members')
                }
            }

            console.log(`Subscription activated: User ${userId} → ${limits.drivers} drivers, ${limits.orders} orders/mo`)

            return NextResponse.json({
                status: 'success',
                message: 'Subscription activated',
                driver_limit: limits.drivers,
                order_limit: limits.orders
            })

        // DEACTIVATE: cancellation, expiration, billing issue
        } else if (['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE'].includes(eventType)) {
            const { error: revertError } = await supabaseAdmin
                .from('users')
                .update({
                    driver_limit: TRIAL_DEFAULTS.drivers,
                    order_limit: TRIAL_DEFAULTS.orders,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)

            if (revertError) {
                console.error('RevenueCat Webhook: Failed to revert user:', revertError)
                throw revertError
            }

            await supabaseAdmin.from('revenuecat_webhook_log').insert({
                event_id: eventId, event_type: eventType, user_id: userId, payload, status: 'processed'
            })

            // Close active subscription
            await supabaseAdmin
                .from('subscription_history')
                .update({ ended_at: new Date().toISOString(), is_active: false })
                .eq('user_id', userId)
                .eq('is_active', true)

            console.log(`Subscription ended: User ${userId} → trial defaults (${TRIAL_DEFAULTS.drivers} drivers)`)

            return NextResponse.json({
                status: 'success',
                message: 'Subscription ended, reverted to trial defaults',
                driver_limit: TRIAL_DEFAULTS.drivers
            })

        } else {
            // Unknown event — log but don't process
            await supabaseAdmin.from('revenuecat_webhook_log').insert({
                event_id: eventId, event_type: eventType, user_id: userId, payload, status: 'ignored'
            })

            return NextResponse.json({ status: 'ignored', message: `Event type ${eventType} not handled` })
        }

    } catch (error) {
        console.error('RevenueCat Webhook Error:', error)
        return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 })
    }
}
