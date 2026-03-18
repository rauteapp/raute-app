import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { applyRateLimit } from '@/lib/rate-limit'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY for send-welcome')
}

const supabaseAdmin = createClient(supabaseUrl || '', supabaseKey || '')

/**
 * POST /api/auth/send-welcome
 *
 * Sends a branded welcome email to newly created drivers/dispatchers
 * with a password setup link. Uses Supabase's generateLink() to create
 * a secure recovery token, then sends it via Resend with custom branding.
 */
export async function POST(request: NextRequest) {
    const rateLimited = applyRateLimit(request, 'authEmail')
    if (rateLimited) return rateLimited

    try {
        const { email, name, role, userId } = await request.json()

        if (!email || !name) {
            return NextResponse.json({ error: 'Missing email or name' }, { status: 400 })
        }

        // Verify the caller is authenticated and is a manager
        const authHeader = request.headers.get('authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
        if (!caller) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: callerProfile } = await supabaseAdmin
            .from('users')
            .select('role, company_id, full_name')
            .eq('id', caller.id)
            .single()

        if (!callerProfile || callerProfile.role !== 'manager') {
            return NextResponse.json({ error: 'Only managers can send welcome emails' }, { status: 403 })
        }

        // Get company name for the email
        const { data: company } = await supabaseAdmin
            .from('companies')
            .select('name')
            .eq('id', callerProfile.company_id)
            .single()

        const companyName = company?.name || 'your team'
        const displayRole = role === 'dispatcher' ? 'Dispatcher' : 'Driver'
        const managerName = callerProfile.full_name || 'Your Manager'

        // Store manager name in the new user's metadata so the welcome page can display it
        if (userId) {
            try {
                await supabaseAdmin.auth.admin.updateUserById(userId, {
                    user_metadata: {
                        created_by_name: managerName,
                    }
                })
            } catch (metaErr) {
                console.error('Failed to update user metadata:', metaErr)
                // Non-fatal — continue sending the email
            }
        }

        // Generate a secure password recovery link using Supabase Admin API
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: {
                redirectTo: 'https://raute.io/welcome-setup',
            }
        })

        if (linkError || !linkData) {
            console.error('Failed to generate link:', linkError)
            return NextResponse.json({ error: 'Failed to generate setup link' }, { status: 500 })
        }

        // Use the action_link directly from generateLink — it contains the correct
        // token format and parameters for the current Supabase version.
        // Do NOT manually construct the verify URL as the token parameter name
        // may differ between Supabase versions (token vs token_hash).
        const setupUrl = linkData.properties.action_link

        // Send branded welcome email via Resend
        const resendKey = process.env.RESEND_API_KEY
        if (!resendKey) {
            return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
        }

        const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Raute <noreply@raute.io>',
                to: [email],
                subject: `Welcome to Raute — Set Up Your Account`,
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden;">
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 32px; text-align: center;">
                            <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">RAUTE</h1>
                        </div>

                        <!-- Body -->
                        <div style="padding: 40px 32px;">
                            <h2 style="color: #1e293b; font-size: 22px; font-weight: 600; margin: 0 0 8px;">Welcome aboard, ${name}!</h2>
                            <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                                You've been added as a <strong>${displayRole}</strong> to <strong>${companyName}</strong> on Raute — Smart Delivery Management.
                            </p>

                            <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 32px;">
                                Click the button below to set up your password and get started.
                            </p>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin: 0 0 32px;">
                                <a href="${setupUrl}"
                                   style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 40px; border-radius: 10px;">
                                    Set Up Your Account
                                </a>
                            </div>

                            <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
                                After setting your password, you can log in at <a href="https://raute.io/login" style="color: #2563eb; text-decoration: none;">raute.io</a> or download the Raute app.
                            </p>

                            <p style="color: #cbd5e1; font-size: 12px; line-height: 1.5; margin: 0;">
                                If you didn't expect this email, you can safely ignore it.
                            </p>
                        </div>

                        <!-- Footer -->
                        <div style="border-top: 1px solid #f1f5f9; padding: 24px 32px; text-align: center;">
                            <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                                Raute — Smart Delivery Management
                            </p>
                            <a href="https://raute.io" style="color: #2563eb; font-size: 13px; text-decoration: none;">raute.io</a>
                        </div>
                    </div>
                `,
            }),
        })

        if (!emailResponse.ok) {
            const errorBody = await emailResponse.text()
            console.error('Resend error:', errorBody)
            return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Welcome email error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
