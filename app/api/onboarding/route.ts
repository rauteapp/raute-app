import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies()

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll() {
                        // Read-only context: this API route doesn't need to set cookies
                    },
                },
            }
        )

        // 1. Authenticate User
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { companyName, fullName, phone } = body

        if (!companyName) {
            return NextResponse.json({ error: 'Company Name is required' }, { status: 400 })
        }

        // P1-SEC-5: Prevent re-onboarding — if user already has a company, block
        const { data: existingProfile } = await supabase
            .from('users')
            .select('company_id, role')
            .eq('id', user.id)
            .single()

        if (existingProfile?.company_id) {
            return NextResponse.json({ error: 'Account already onboarded' }, { status: 409 })
        }

        // 2. Create Company
        // We generate ID here to avoid RLS select issues (user can't see company yet)
        const newCompanyId = crypto.randomUUID()

        const { error: companyError } = await supabase
            .from('companies')
            .insert({
                id: newCompanyId,
                name: companyName
            })

        if (companyError) {
            console.error('Company creation error:', companyError)
            return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
        }

        // 3. Update User Profile
        // Link to company, set trial period, and initialize limits (critical for OAuth users)
        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

        const { error: userError } = await supabase
            .from('users')
            .update({
                company_id: newCompanyId,
                full_name: fullName,
                phone: phone,
                role: 'manager',
                driver_limit: 5,
                order_limit: 500,
                trial_ends_at: trialEndsAt,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)

        if (userError) {
            console.error('User update error:', userError)
            return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 })
        }

        // 4. Force Session Refresh (Optional but recommended so token gets updated claims if using Custom Claims, though here we rely on DB)
        // We can't easily refresh session server-side for the client, but the client router.refresh() will handle data re-fetching.

        return NextResponse.json({ success: true, companyId: newCompanyId })

    } catch (error: any) {
        console.error('Onboarding API Error:', error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
