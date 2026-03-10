import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { getLimitsForPriceId } from '@/lib/stripe-plans'

const TRIAL_DEFAULTS = { drivers: 5, orders: 500 }

export async function POST(request: Request) {
    try {
        const stripeKey = process.env.STRIPE_SECRET_KEY
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
        if (!stripeKey || !webhookSecret) {
            return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
        }

        const stripe = new Stripe(stripeKey)
        const body = await request.text()
        const signature = request.headers.get('stripe-signature')

        if (!signature) {
            return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
        }

        let event: Stripe.Event
        try {
            event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
        } catch (err) {
            console.error('Stripe webhook signature verification failed:', err)
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        console.log(`Stripe Webhook: ${event.type}`, { eventId: event.id })

        // Idempotency check — skip if already processed
        const { data: existingEvent } = await supabaseAdmin
            .from('stripe_webhook_log')
            .select('event_id')
            .eq('event_id', event.id)
            .single()

        if (existingEvent) {
            return NextResponse.json({ received: true, status: 'duplicate' })
        }

        switch (event.type) {
            // New subscription created (checkout completed)
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session
                if (session.mode !== 'subscription') break

                const userId = session.metadata?.supabase_user_id || session.client_reference_id
                const driverLimit = parseInt(session.metadata?.driver_limit || '5')
                const orderLimit = parseInt(session.metadata?.order_limit || '500')
                const planId = session.metadata?.plan_id || 'unknown'
                const isFoundingMember = session.metadata?.is_founding === 'true'

                if (!userId) {
                    console.error('Stripe Webhook: No user ID in session metadata')
                    break
                }

                // Update user limits
                await supabaseAdmin
                    .from('users')
                    .update({
                        driver_limit: driverLimit,
                        order_limit: orderLimit,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', userId)

                // Close old subscriptions
                await supabaseAdmin
                    .from('subscription_history')
                    .update({ ended_at: new Date().toISOString(), is_active: false })
                    .eq('user_id', userId)
                    .eq('is_active', true)

                // Create new subscription record
                await supabaseAdmin.from('subscription_history').insert({
                    user_id: userId,
                    tier_name: `stripe_${planId}`,
                    driver_limit: driverLimit,
                    is_active: true,
                    revenue_cat_subscription_id: session.subscription as string,
                })

                // Atomic founding member increment (race-safe)
                if (isFoundingMember) {
                    await supabaseAdmin.rpc('increment_founding_member')
                }

                // Log for idempotency
                await supabaseAdmin.from('stripe_webhook_log').insert({
                    event_id: event.id, event_type: event.type, user_id: userId, status: 'processed'
                })

                console.log(`Stripe: Subscription activated for ${userId} → ${driverLimit} drivers`)
                break
            }

            // Subscription renewed successfully
            case 'invoice.paid': {
                const invoice = event.data.object as Stripe.Invoice
                const invoiceSub = (invoice as any).subscription
                if (!invoiceSub) break

                const subscription = await stripe.subscriptions.retrieve(invoiceSub as string)
                const userId = subscription.metadata?.supabase_user_id
                if (!userId) break

                const priceId = subscription.items.data[0]?.price.id
                const limits = priceId ? getLimitsForPriceId(priceId) : null

                if (limits) {
                    await supabaseAdmin
                        .from('users')
                        .update({
                            driver_limit: limits.drivers,
                            order_limit: limits.orders,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', userId)
                }

                await supabaseAdmin.from('stripe_webhook_log').insert({
                    event_id: event.id, event_type: event.type, user_id: userId, status: 'processed'
                })
                console.log(`Stripe: Invoice paid for ${userId}`)
                break
            }

            // Subscription cancelled or expired
            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription
                const userId = subscription.metadata?.supabase_user_id
                if (!userId) break

                await supabaseAdmin
                    .from('users')
                    .update({
                        driver_limit: TRIAL_DEFAULTS.drivers,
                        order_limit: TRIAL_DEFAULTS.orders,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', userId)

                await supabaseAdmin
                    .from('subscription_history')
                    .update({ ended_at: new Date().toISOString(), is_active: false })
                    .eq('user_id', userId)
                    .eq('is_active', true)

                await supabaseAdmin.from('stripe_webhook_log').insert({
                    event_id: event.id, event_type: event.type, user_id: userId, status: 'processed'
                })
                console.log(`Stripe: Subscription ended for ${userId}`)
                break
            }

            // Payment failed
            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice
                const failedInvoiceSub = (invoice as any).subscription
                if (!failedInvoiceSub) break

                const subscription = await stripe.subscriptions.retrieve(failedInvoiceSub as string)
                const userId = subscription.metadata?.supabase_user_id
                if (!userId) break

                console.log(`Stripe: Payment failed for ${userId}`)
                // Don't immediately revert — Stripe will retry. Only customer.subscription.deleted fully cancels.
                break
            }

            // Plan upgrade/downgrade
            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription
                const userId = subscription.metadata?.supabase_user_id
                if (!userId) break

                // Only process if status is active
                if (subscription.status !== 'active') break

                const priceId = subscription.items.data[0]?.price.id
                const limits = priceId ? getLimitsForPriceId(priceId) : null

                if (limits) {
                    await supabaseAdmin
                        .from('users')
                        .update({
                            driver_limit: limits.drivers,
                            order_limit: limits.orders,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', userId)

                    // Update active subscription record
                    await supabaseAdmin
                        .from('subscription_history')
                        .update({
                            driver_limit: limits.drivers,
                            tier_name: `stripe_${limits.drivers === 5 ? 'starter' : limits.drivers === 15 ? 'pro' : 'pioneer'}`,
                        })
                        .eq('user_id', userId)
                        .eq('is_active', true)

                    await supabaseAdmin.from('stripe_webhook_log').insert({
                        event_id: event.id, event_type: event.type, user_id: userId, status: 'processed'
                    })
                    console.log(`Stripe: Plan updated for ${userId} → ${limits.drivers} drivers`)
                }
                break
            }
        }

        return NextResponse.json({ received: true })
    } catch (error) {
        console.error('Stripe Webhook Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
