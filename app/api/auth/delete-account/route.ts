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
        // The userId from body is ignored — we use the authenticated user's ID
        const userId = authUser.id

        // 3. Delete User from Auth (cascades to public tables if FK is set)
        const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId)

        if (error) {
            console.error('Account deletion failed for user:', userId.substring(0, 8))
            return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
        }

        return NextResponse.json({ message: 'Account deleted successfully' })

    } catch (error) {
        console.error('Delete account error')
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
