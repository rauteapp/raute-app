import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getSupabaseAdmin } from '@/lib/api-auth'

export const dynamic = "force-static"

export async function GET(request: NextRequest) {
    try {
        // 1. Verify the request is authenticated
        const authUser = await getAuthenticatedUser(request)
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Only allow syncing your OWN role (ignore userId from params)
        const userId = authUser.id

        // 3. Get the user's role and company_id from public.users
        const { data: user, error: userError } = await getSupabaseAdmin()
            .from('users')
            .select('role, company_id')
            .eq('id', userId)
            .single()

        if (userError || !user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        const userData = user as { role: string; company_id: string }

        // 4. Update auth.users metadata with the correct role
        const { error: updateError } = await getSupabaseAdmin().auth.admin.updateUserById(userId, {
            user_metadata: {
                role: userData.role,
                company_id: userData.company_id,
            }
        })

        if (updateError) {
            console.error('sync-user-role: failed to update metadata')
            return NextResponse.json({ error: 'Failed to sync role' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            role: userData.role,
            company_id: userData.company_id,
        })
    } catch (err) {
        console.error('sync-user-role error')
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
