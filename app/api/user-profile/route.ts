import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getSupabaseAdmin } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/api-rate-limit'

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    try {
        // Rate limit: 20 requests per 60 seconds
        const rateLimited = checkRateLimit(request, { windowSeconds: 60, maxRequests: 20 })
        if (rateLimited) return rateLimited

        // 1. Verify the request is authenticated
        const authUser = await getAuthenticatedUser(request)
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Only allow fetching your OWN profile (ignore userId from params)
        const userId = authUser.id

        // 3. Fetch user profile
        const { data: user, error } = await getSupabaseAdmin()
            .from('users')
            .select('id, email, role, company_id, full_name, status, permissions')
            .eq('id', userId)
            .single()

        if (error || !user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        const userData = user as Record<string, unknown>

        return NextResponse.json({
            success: true,
            user: {
                id: userData.id,
                email: userData.email,
                role: userData.role,
                company_id: userData.company_id,
                full_name: userData.full_name,
                status: userData.status,
                permissions: userData.permissions,
            }
        })
    } catch (err) {
        console.error('user-profile error')
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
