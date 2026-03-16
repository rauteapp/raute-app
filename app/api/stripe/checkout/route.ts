import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { getStripePlans, getFoundingCouponId } from '@/lib/stripe-plans'
import { applyRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
    const rateLimited = applyRateLimit(request, 'checkout')
    if (rateLimited) return rateLimited

    try {
        const stripeKey = process.env.STRIPE_SECRET_KEY
        if (!stripeKey) {
            return NextResponse.json(
                { error: 'Stripe is not configured yet. Please contact support.' },
                { status: 503 }
            )
        }

        const stripe = new Stripe(stripeKey)

        // Authenticate user
        const authHeader = request.headers.get('authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                global: { headers: { Authorization: authHeader } },
                auth: { autoRefreshToken: false, persistSession: false }
            }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { planId, billingCycle = 'monthly', promoCode } = body

        if (!planId || !['starter', 'pro', 'pioneer'].includes(planId)) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
        }

        // Get plan details
        const plans = getStripePlans(billingCycle)
        const plan = plans.find(p => p.id === planId)

        if (!plan || !plan.priceId) {
            return NextResponse.json(
                { error: 'Stripe prices not configured. Please contact support.' },
                { status: 503 }
            )
        }

        // Check founding member status
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        const { data: config } = await supabaseAdmin
            .from('app_config')
            .select('value')
            .eq('key', 'founding_members')
            .single()

        const isFoundingAvailable = config?.value?.active && config.value.count < config.value.limit
        const foundingCouponId = getFoundingCouponId()

        // Build checkout session config
        const sessionConfig: Stripe.Checkout.SessionCreateParams = {
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: plan.priceId, quantity: 1 }],
            success_url: `${process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin')}/subscribe?success=true`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin')}/subscribe?canceled=true`,
            client_reference_id: user.id,
            customer_email: user.email,
            metadata: {
                supabase_user_id: user.id,
                plan_id: planId,
                driver_limit: plan.driverLimit.toString(),
                order_limit: plan.orderLimit.toString(),
                is_founding: 'false',
            },
            subscription_data: {
                metadata: {
                    supabase_user_id: user.id,
                    plan_id: planId,
                    driver_limit: plan.driverLimit.toString(),
                    order_limit: plan.orderLimit.toString(),
                    original_plan_id: planId,
                },
            },
        }

        // Apply founding member coupon if promo code provided and founding is still active
        if (promoCode && isFoundingAvailable && foundingCouponId) {
            // Validate the promo code against Stripe
            try {
                const promoCodes = await stripe.promotionCodes.list({
                    code: promoCode,
                    active: true,
                    limit: 1,
                })

                if (promoCodes.data.length > 0) {
                    const stripePromo = promoCodes.data[0] as any
                    // Verify this promo code belongs to our founding member coupon
                    const couponId = stripePromo.coupon?.id
                    if (couponId && couponId === foundingCouponId) {
                        sessionConfig.discounts = [{ promotion_code: stripePromo.id }]
                        sessionConfig.metadata!.is_founding = 'true'
                        sessionConfig.subscription_data!.metadata!.is_founding = 'true'
                    }
                }
            } catch (e) {
                console.error('Promo code validation error:', e)
                // Continue without discount — don't block checkout
            }
        }

        // Allow promo code input in Stripe Checkout if no discount was pre-applied
        if (!sessionConfig.discounts) {
            sessionConfig.allow_promotion_codes = true
        }

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create(sessionConfig)

        return NextResponse.json({ url: session.url })
    } catch (error) {
        console.error('Stripe checkout error:', error)
        return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
    }
}
