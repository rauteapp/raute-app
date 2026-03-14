import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/auth/set-initial-password
 *
 * Sets the password for a newly created driver/dispatcher during welcome setup.
 * Uses the admin API (updateUserById) so Supabase does NOT send a
 * "Your password has been changed" confirmation email — because this is
 * the first time the user is setting their password, not a change.
 *
 * Requires: a valid access_token from the recovery session (proves identity).
 */
export async function POST(request: NextRequest) {
    try {
        const { access_token, password } = await request.json()

        if (!access_token || !password) {
            return NextResponse.json(
                { error: 'Missing access_token or password' },
                { status: 400 }
            )
        }

        if (password.length < 8) {
            return NextResponse.json(
                { error: 'Password must be at least 8 characters' },
                { status: 400 }
            )
        }

        // Verify the access_token to get the user identity
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(access_token)

        if (userError || !user) {
            return NextResponse.json(
                { error: 'Invalid or expired session' },
                { status: 401 }
            )
        }

        // Use admin API to set the password — does NOT trigger confirmation email
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            { password }
        )

        if (updateError) {
            console.error('Failed to set initial password:', updateError)
            return NextResponse.json(
                { error: updateError.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true })

    } catch (err: any) {
        console.error('set-initial-password error:', err)
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
