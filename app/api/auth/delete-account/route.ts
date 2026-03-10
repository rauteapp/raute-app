import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getSupabaseAdmin } from '@/lib/api-auth'
import { applyRateLimit } from '@/lib/rate-limit'

export async function DELETE(req: Request) {
    const rateLimited = applyRateLimit(req, 'deleteAccount')
    if (rateLimited) return rateLimited

    try {
        // 1. Verify the request is authenticated
        const authUser = await getAuthenticatedUser(req)
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Only allow users to delete their OWN account
        const userId = authUser.id
        const supabaseAdmin = getSupabaseAdmin()

        // 3. Cancel any active subscriptions to prevent zombie billing
        // Cast to any to bypass strict typing (subscription_history not in generated types)
        const db = supabaseAdmin as any
        const { data: activeSubs } = await db
            .from('subscription_history')
            .select('id, platform, external_id')
            .eq('user_id', userId)
            .eq('is_active', true)

        if (activeSubs && activeSubs.length > 0) {
            // Mark all active subscriptions as cancelled in our DB
            await db
                .from('subscription_history')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('is_active', true)

            // Try to cancel Stripe subscription if applicable
            const stripeKey = process.env.STRIPE_SECRET_KEY
            if (stripeKey) {
                for (const sub of activeSubs) {
                    if (sub.platform === 'stripe' && sub.external_id) {
                        try {
                            const Stripe = (await import('stripe')).default
                            const stripe = new Stripe(stripeKey)
                            await stripe.subscriptions.cancel(sub.external_id)
                        } catch (e) {
                            console.warn('Failed to cancel Stripe subscription on account deletion:', sub.external_id)
                        }
                    }
                }
            }
        }

        // 4. Delete User from Auth (cascades to public tables if FK is set)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (error) {
            console.error('Account deletion failed for user:', userId.substring(0, 8))
            return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
        }

        return NextResponse.json({ message: 'Account deleted successfully' })

    } catch (error) {
        console.error('Delete account error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
