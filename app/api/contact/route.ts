import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { applyRateLimit } from '@/lib/rate-limit'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
    const rateLimited = applyRateLimit(request, 'contact')
    if (rateLimited) return rateLimited

    try {
        const body = await request.json()
        const { name, email, company, message } = body

        if (!name || !email || !message) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // P1-SEC-4: Sanitize inputs to prevent HTML injection in email
        const sanitize = (str: string) => str.replace(/[<>&"']/g, (c) => ({
            '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
        }[c] || c))
        const safeName = sanitize(name)
        const safeEmail = sanitize(email)
        const safeCompany = company ? sanitize(company) : 'Not provided'
        const safeMessage = sanitize(message)

        // Save to database
        const { error: dbError } = await supabase
            .from('contact_submissions')
            .insert({
                name,
                email,
                company_name: company || null,
                message,
                status: 'new'
            })

        if (dbError) {
            console.error('DB error:', dbError)
            return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
        }

        // Send notification email via Resend
        const resendKey = process.env.RESEND_API_KEY
        if (resendKey) {
            try {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: 'Raute <noreply@raute.io>',
                        to: ['support@raute.io'],
                        subject: `New Contact Form: ${safeName}`,
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                                <h2 style="color: #2563eb;">New Contact Form Submission</h2>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Name</td>
                                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${safeName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Email</td>
                                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Company</td>
                                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${safeCompany}</td>
                                    </tr>
                                </table>
                                <div style="margin-top: 16px; padding: 16px; background: #f8fafc; border-radius: 8px;">
                                    <p style="font-weight: bold; margin: 0 0 8px;">Message:</p>
                                    <p style="margin: 0; white-space: pre-wrap;">${safeMessage}</p>
                                </div>
                                <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
                                    Reply directly to this email to respond to ${safeName} at ${safeEmail}
                                </p>
                            </div>
                        `,
                        reply_to: email,
                    }),
                })
            } catch (emailError) {
                // Don't fail the submission if email fails
                console.error('Email notification failed:', emailError)
            }
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Contact form error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
