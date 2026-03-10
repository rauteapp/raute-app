import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { getStripePlans } from '@/lib/stripe-plans'
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
        const { planId, billingCycle = 'monthly' } = body

        if (!planId || !['starter', 'pro', 'pioneer'].includes(planId)) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
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
        const plans = getStripePlans(billingCycle, isFoundingAvailable)
        const plan = plans.find(p => p.id === planId)

        if (!plan) {
            return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
        }

        const priceId = (isFoundingAvailable && plan.foundingPriceId) || plan.priceId
        if (!priceId) {
            return NextResponse.json(
                { error: 'Stripe prices not configured. Please contact support.' },
                { status: 503 }
            )
        }

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin')}/subscribe?success=true`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin')}/subscribe?canceled=true`,
            client_reference_id: user.id,
            customer_email: user.email,
            metadata: {
                supabase_user_id: user.id,
                plan_id: planId,
                driver_limit: plan.driverLimit.toString(),
                order_limit: plan.orderLimit.toString(),
                is_founding: isFoundingAvailable ? 'true' : 'false',
            },
            subscription_data: {
                metadata: {
                    supabase_user_id: user.id,
                    plan_id: planId,
                    driver_limit: plan.driverLimit.toString(),
                    order_limit: plan.orderLimit.toString(),
                },
            },
        })

        return NextResponse.json({ url: session.url })
    } catch (error) {
        console.error('Stripe checkout error:', error)
        return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
    }
}
