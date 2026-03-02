import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = "force-static"

/**
 * RevenueCat Webhook Handler
 * Processes subscription events and updates driver_limit
 *
 * Webhook URL: https://your-domain.com/api/webhooks/revenuecat
 * Configure in RevenueCat Dashboard → Integrations → Webhooks
 */

export async function POST(request: Request) {
    try {
        // Verify webhook authorization token
        const authHeader = request.headers.get('authorization')
        const expectedToken = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN
        if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        // Parse webhook payload
        const payload = await request.json()

        // Extract event data
        const {
            event: {
                type: eventType,
                id: eventId,
                app_user_id: userId,
                product_id: productId,
                period_type: periodType,
                purchased_at_ms: purchasedAt,
                expiration_at_ms: expirationAt
            }
        } = payload

        console.log(`📥 RevenueCat Webhook: ${eventType}`, { userId, productId, eventId })

        // ✅ IDEMPOTENCY CHECK
        const { data: existingEvent } = await supabaseAdmin
            .from('revenuecat_webhook_log')
            .select('event_id')
            .eq('event_id', eventId)
            .single()

        if (existingEvent) {
            console.log(`⚠️ Duplicate event ${eventId}, ignoring`)
            return NextResponse.json({
                status: 'duplicate',
                message: 'Event already processed'
            })
        }

        // Map product ID to driver limit
        const driverLimitMap: Record<string, number> = {
            'raute_5_drivers': 5,
            'raute_10_drivers': 10,
            'raute_15_drivers': 15,
            'raute_20_drivers': 20
        }

        const newDriverLimit = driverLimitMap[productId] || 1

        // Process based on event type
        if (eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL' || eventType === 'UNCANCELLATION') {
            // ✅ ACTIVATE/RENEW SUBSCRIPTION

            // Update user's driver limit
            const { error: updateError } = await supabaseAdmin
                .from('users')
                .update({
                    driver_limit: newDriverLimit,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)

            if (updateError) throw updateError

            // Log webhook event
            await supabaseAdmin
                .from('revenuecat_webhook_log')
                .insert({
                    event_id: eventId,
                    event_type: eventType,
                    user_id: userId,
                    payload: payload,
                    status: 'processed'
                })

            // Create subscription history record
            await supabaseAdmin
                .from('subscription_history')
                .insert({
                    user_id: userId,
                    tier_name: productId,
                    driver_limit: newDriverLimit,
                    revenue_cat_subscription_id: payload.event?.subscriber_attributes?.['$revenuecat_id']
                })

            console.log(`✅ Subscription activated: User ${userId} → ${newDriverLimit} drivers`)

            return NextResponse.json({
                status: 'success',
                message: 'Subscription activated',
                driver_limit: newDriverLimit
            })

        } else if (eventType === 'CANCELLATION' || eventType === 'EXPIRATION' || eventType === 'BILLING_ISSUE') {
            // ❌ REVERT TO FREE TIER

            const { error: revertError } = await supabaseAdmin
                .from('users')
                .update({
                    driver_limit: 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)

            if (revertError) throw revertError

            // Log webhook event
            await supabaseAdmin
                .from('revenuecat_webhook_log')
                .insert({
                    event_id: eventId,
                    event_type: eventType,
                    user_id: userId,
                    payload: payload,
                    status: 'processed'
                })

            // Close active subscription
            await supabaseAdmin
                .from('subscription_history')
                .update({
                    ended_at: new Date().toISOString(),
                    is_active: false
                })
                .eq('user_id', userId)
                .eq('is_active', true)

            console.log(`❌ Subscription cancelled: User ${userId} → Free tier (1 driver)`)

            return NextResponse.json({
                status: 'success',
                message: 'Subscription cancelled, reverted to free tier',
                driver_limit: 1
            })

        } else {
            // Unknown event type, log but don't process
            await supabaseAdmin
                .from('revenuecat_webhook_log')
                .insert({
                    event_id: eventId,
                    event_type: eventType,
                    user_id: userId,
                    payload: payload,
                    status: 'ignored'
                })

            return NextResponse.json({
                status: 'ignored',
                message: `Event type ${eventType} not handled`
            })
        }

    } catch (error) {
        console.error('RevenueCat Webhook Error')

        return NextResponse.json({
            status: 'error',
            message: 'Internal server error'
        }, { status: 500 })
    }
}
