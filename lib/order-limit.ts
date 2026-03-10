import { supabase } from '@/lib/supabase'

/**
 * Check if the company has remaining order capacity this month.
 * Returns { allowed, used, limit, remaining } or throws on error.
 */
export async function checkOrderLimit(companyId: string): Promise<{
    allowed: boolean
    used: number
    limit: number
    remaining: number
}> {
    // Get the manager's order_limit for this company
    const { data: manager } = await supabase
        .from('users')
        .select('order_limit')
        .eq('company_id', companyId)
        .eq('role', 'manager')
        .limit(1)
        .single()

    const limit = manager?.order_limit || 500

    // Count orders created this calendar month
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', monthStart)

    if (error) {
        console.error('Order limit check failed:', error)
        // Allow creation if check fails (don't block on error)
        return { allowed: true, used: 0, limit, remaining: limit }
    }

    const used = count || 0
    const remaining = Math.max(0, limit - used)

    return {
        allowed: used < limit,
        used,
        limit,
        remaining,
    }
}
