import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getSupabaseAdmin } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/api-rate-limit'

/**
 * POST /api/push/send
 *
 * Send push notifications to one or more drivers via FCM HTTP v1 API.
 * Only accessible by authenticated managers and admins.
 *
 * Body: {
 *   driver_ids: string[]   — array of driver UUIDs to notify
 *   title: string          — notification title
 *   body: string           — notification body text
 *   data?: Record<string, string> — optional custom data payload
 * }
 *
 * Env vars required:
 *   FIREBASE_CLIENT_EMAIL  — Firebase service account email
 *   FIREBASE_PRIVATE_KEY   — Firebase service account private key (PEM)
 */

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'raute-app'
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`

// ─── JWT / OAuth2 helpers ────────────────────────────────────────────────────

function base64url(data: Uint8Array): string {
  let binary = ''
  for (const byte of data) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  const binaryString = atob(pemContents)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return await crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

async function createSignedJwt(
  clientEmail: string,
  privateKey: CryptoKey
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  const encoder = new TextEncoder()
  const encodedHeader = base64url(encoder.encode(JSON.stringify(header)))
  const encodedPayload = base64url(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(signingInput)
  )

  const encodedSignature = base64url(new Uint8Array(signature))
  return `${signingInput}.${encodedSignature}`
}

// Token cache (module-level, survives across requests in the same serverless instance)
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(
  clientEmail: string,
  privateKeyPem: string
): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.token
  }

  const privateKey = await importPrivateKey(privateKeyPem)
  const jwt = await createSignedJwt(clientEmail, privateKey)

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Google OAuth2 token request failed: ${resp.status} ${errText}`)
  }

  const data = await resp.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.token
}

// ─── Send a single FCM notification ─────────────────────────────────────────

async function sendFcmNotification(
  accessToken: string,
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string; messageName?: string; invalidToken?: boolean }> {
  const message = {
    message: {
      token: pushToken,
      notification: { title, body },
      data: data || {},
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
            'content-available': 1,
          },
        },
      },
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'default',
          channel_id: 'default',
        },
      },
    },
  }

  const resp = await fetch(FCM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })

  const result = await resp.json()

  if (!resp.ok) {
    // Detect invalid/expired push tokens so caller can clean them up
    const errorCode = result.error?.details?.[0]?.errorCode || result.error?.code || ''
    const isInvalidToken = errorCode === 'UNREGISTERED' ||
      errorCode === 'INVALID_ARGUMENT' ||
      resp.status === 404

    return {
      success: false,
      error: result.error?.message || `FCM error ${resp.status}`,
      invalidToken: isInvalidToken,
    }
  }

  return { success: true, messageName: result.name }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Rate limit: 10 req/60s per IP
  const rateLimited = checkRateLimit(request, { windowSeconds: 60, maxRequests: 10 })
  if (rateLimited) return rateLimited

  try {
    // 1. Authenticate
    const authUser = await getAuthenticatedUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Check role — only managers and admins can send push notifications
    const supabaseAdmin = getSupabaseAdmin()
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('role, company_id')
      .eq('id', authUser.id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const { role, company_id } = user as { role: string; company_id: string }

    if (!['admin', 'manager'].includes(role)) {
      return NextResponse.json(
        { error: 'Forbidden — only managers and admins can send notifications' },
        { status: 403 }
      )
    }

    // 3. Parse request body
    const { driver_ids, title, body, data } = await request.json()

    if (!driver_ids || !Array.isArray(driver_ids) || driver_ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty driver_ids array' },
        { status: 400 }
      )
    }

    if (!title || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: title, body' },
        { status: 400 }
      )
    }

    // Validate title/body length
    if (String(title).length > 500 || String(body).length > 500) {
      return NextResponse.json(
        { error: 'title and body must be under 500 characters' },
        { status: 400 }
      )
    }

    // 4. Fetch push tokens for all requested drivers (same company only)
    const { data: drivers, error: driversError } = await supabaseAdmin
      .from('drivers')
      .select('id, name, push_token, platform')
      .in('id', driver_ids)
      .eq('company_id', company_id)

    if (driversError) {
      return NextResponse.json(
        { error: 'Failed to fetch drivers', details: driversError.message },
        { status: 500 }
      )
    }

    const typedDrivers = (drivers || []) as Array<{ id: string; name: string; push_token: string | null; platform: string | null }>

    if (!typedDrivers || typedDrivers.length === 0) {
      return NextResponse.json(
        { error: 'No drivers found for the given IDs' },
        { status: 404 }
      )
    }

    // 5. Get Firebase credentials
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY

    if (!clientEmail || !privateKeyRaw) {
      return NextResponse.json(
        { error: 'Firebase credentials not configured on server' },
        { status: 500 }
      )
    }

    // Restore escaped newlines in private key
    const privateKeyPem = privateKeyRaw.replace(/\\n/g, '\n')

    // 6. Get OAuth2 access token
    const accessToken = await getAccessToken(clientEmail, privateKeyPem)

    // 7. Send notifications to all drivers in parallel
    const results = await Promise.allSettled(
      typedDrivers.map(async (driver) => {
        if (!driver.push_token) {
          return {
            driver_id: driver.id,
            driver_name: driver.name,
            success: false,
            error: 'No push token registered',
          }
        }

        const result = await sendFcmNotification(
          accessToken,
          driver.push_token,
          title,
          body,
          data
        )

        return {
          driver_id: driver.id,
          driver_name: driver.name,
          ...result,
        }
      })
    )

    // 8. Compile results
    const notifications = results.map((r) => {
      if (r.status === 'fulfilled') return r.value
      return { success: false, error: String(r.reason) }
    })

    // 9. Clean up invalid/expired push tokens (fire-and-forget)
    const invalidTokenDriverIds = notifications
      .filter((n: any) => n.invalidToken && n.driver_id)
      .map((n: any) => n.driver_id)

    if (invalidTokenDriverIds.length > 0) {
      // Clean up stale push tokens (fire-and-forget)
      ;(supabaseAdmin
        .from('drivers') as any)
        .update({ push_token: null })
        .in('id', invalidTokenDriverIds)
        .then(({ error }: any) => {
          if (error) console.error('Failed to clean stale push tokens:', error)
          else console.log(`Cleaned ${invalidTokenDriverIds.length} stale push token(s)`)
        })
    }

    const successCount = notifications.filter((n: any) => n.success).length
    const failCount = notifications.length - successCount

    return NextResponse.json({
      success: failCount === 0,
      sent: successCount,
      failed: failCount,
      total: notifications.length,
      results: notifications,
    })
  } catch (err) {
    console.error('Push send error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    )
  }
}
