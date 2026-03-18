import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { applyRateLimit } from '@/lib/rate-limit'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request) {
    // Rate limit: 20 req/min per IP
    const rateLimited = applyRateLimit(request, 'trackingEmail')
    if (rateLimited) return rateLimited

    try {
        // Authenticate caller
        const authHeader = request.headers.get('authorization')
        let callerCompanyId: string | null = null

        if (authHeader?.startsWith('Bearer ')) {
            const supabaseAuth = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                {
                    global: { headers: { Authorization: authHeader } },
                    auth: { autoRefreshToken: false, persistSession: false }
                }
            )
            const { data: { user } } = await supabaseAuth.auth.getUser()
            if (user) {
                const { data: profile } = await supabaseAdmin
                    .from('users')
                    .select('company_id')
                    .eq('id', user.id)
                    .single()
                callerCompanyId = profile?.company_id || null
            }
        }

        // Also allow internal calls (from the same server, e.g. fire-and-forget fetch)
        // by checking a shared secret or just allowing if no auth header (internal call)
        const isInternalCall = !authHeader

        const { order_id } = await request.json()

        if (!order_id) {
            return NextResponse.json({ error: 'Missing order_id' }, { status: 400 })
        }

        // Look up order
        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, customer_name, customer_email, tracking_token, tracking_email_sent_at, address, city, state, delivery_date, company_id')
            .eq('id', order_id)
            .single()

        if (error || !order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        }

        // Verify caller owns the order (skip for internal calls from same server)
        if (!isInternalCall && callerCompanyId && order.company_id !== callerCompanyId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Skip if no customer email
        if (!order.customer_email) {
            return NextResponse.json({ skipped: true, reason: 'no_email' })
        }

        // Skip if already sent
        if (order.tracking_email_sent_at) {
            return NextResponse.json({ skipped: true, reason: 'already_sent' })
        }

        // Skip if no tracking token
        if (!order.tracking_token) {
            return NextResponse.json({ skipped: true, reason: 'no_tracking_token' })
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://raute.io'
        const trackingUrl = `${baseUrl}/track/${order.tracking_token}`
        const fullAddress = [order.address, order.city, order.state].filter(Boolean).join(', ')

        // Send via Resend
        const resendKey = process.env.RESEND_API_KEY
        if (!resendKey) {
            return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
        }

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Raute <noreply@raute.io>',
                to: [order.customer_email],
                subject: `Your delivery is on the way — Order #${order.order_number}`,
                html: buildTrackingEmailHtml({
                    customerName: order.customer_name || 'Customer',
                    orderNumber: order.order_number,
                    trackingUrl,
                    address: fullAddress,
                    deliveryDate: order.delivery_date,
                }),
            }),
        })

        if (!res.ok) {
            const body = await res.text()
            console.error('Resend API error:', res.status, body)
            return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
        }

        // Mark as sent
        await supabaseAdmin
            .from('orders')
            .update({ tracking_email_sent_at: new Date().toISOString() })
            .eq('id', order_id)

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('send-tracking-email error:', err)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}

function buildTrackingEmailHtml(params: {
    customerName: string
    orderNumber: string
    trackingUrl: string
    address: string
    deliveryDate: string | null
}): string {
    const { customerName, orderNumber, trackingUrl, address, deliveryDate } = params
    const firstName = customerName.split(' ')[0]
    const formattedDate = deliveryDate
        ? new Date(deliveryDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : null

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">R</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:0.5px;">RAUTE DELIVERY</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px 20px;">
          <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:600;">Your delivery is on the way!</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">
            Hi ${firstName}, your order has been assigned to a driver and is being prepared for delivery.
          </p>

          <!-- Order info card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Order Number</p>
              <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:600;">#${orderNumber}</p>

              <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Delivery Address</p>
              <p style="margin:0;color:#334155;font-size:14px;line-height:1.5;">${address || 'See tracking page'}</p>

              ${formattedDate ? `
              <p style="margin:16px 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Expected Date</p>
              <p style="margin:0;color:#334155;font-size:14px;">${formattedDate}</p>
              ` : ''}
            </td></tr>
          </table>

          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${trackingUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:10px;letter-spacing:0.2px;">
              Track Your Delivery
            </a>
          </td></tr></table>

          <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
            Or copy this link:<br>
            <a href="${trackingUrl}" style="color:#2563eb;word-break:break-all;">${trackingUrl}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px 32px;border-top:1px solid #f1f5f9;">
          <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.6;">
            This is an automated delivery notification from Raute.<br>
            You're receiving this because a delivery is scheduled to your address.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
