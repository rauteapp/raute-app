import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/api-auth'

export const dynamic = "force-static"

/**
 * Check if an email has been verified in Supabase Auth.
 * Used by the verify-email page when there's no session
 * (Supabase doesn't create a session until email is verified).
 *
 * Only returns a boolean — no sensitive data is exposed.
 */
export async function POST(request: NextRequest) {
    try {
        const { email } = await request.json()

        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 })
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (getSupabaseAdmin() as any).rpc(
            'check_email_verification',
            { check_email: email.trim().toLowerCase() }
        )

        if (error) {
            console.error('check-verification RPC error:', error.message)
            return NextResponse.json({ verified: false })
        }

        return NextResponse.json({ verified: !!data })
    } catch (err) {
        console.error('check-verification error:', err)
        return NextResponse.json({ verified: false })
    }
}
