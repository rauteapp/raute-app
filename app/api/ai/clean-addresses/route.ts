import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { applyRateLimit } from '@/lib/rate-limit'

// Server-side only — API key never exposed to browser
const xaiClient = new OpenAI({
    apiKey: process.env.XAI_API_KEY || '',
    baseURL: 'https://api.x.ai/v1',
})

const SYSTEM_PROMPT = `You are an address correction specialist for a US delivery company in Southern California.

Given a JSON array of addresses, fix each one so it can be geocoded by Google Maps:

1. Fix street name typos and misspellings (e.g., "S Vont Ave" → "S Vermont Ave", "Chiole's" → likely a facility)
2. If city or state are empty, infer them from zip_code, nearby context, or common Southern California cities
3. Strip apartment/room/unit/suite numbers from the address — move them to correction_notes
4. If the address is clearly a facility name and not a street address, keep it but note this in correction_notes
5. Normalize abbreviations (St, Ave, Blvd, Dr, Ln, Ct, Pl, etc.)
6. Fix obviously wrong city names (e.g., "Rialto Cucamonga" → pick the correct one)

Return a JSON array in the EXACT same order as input. Each item:
{
  "address": "corrected street address",
  "city": "corrected city",
  "state": "corrected state",
  "zip_code": "corrected zip",
  "original_address": "the original address as given",
  "was_corrected": true/false,
  "correction_notes": "what was changed, or empty string"
}

IMPORTANT: Return ONLY the JSON array. No markdown, no explanation.`

async function authenticateRequest(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    const cookieToken = request.cookies.get('sb-access-token')?.value

    const token = authHeader?.replace('Bearer ', '') || cookieToken

    if (!token) return null

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null
    return user
}

export async function POST(request: NextRequest) {
    const rateLimited = applyRateLimit(request, 'ai')
    if (rateLimited) return rateLimited

    try {
        const user = await authenticateRequest(request)
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!process.env.XAI_API_KEY) {
            return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
        }

        const body = await request.json()
        const { addresses } = body

        if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
            return NextResponse.json({ error: 'Invalid addresses' }, { status: 400 })
        }

        const input = addresses.map((a: any) => ({
            address: a.address,
            city: a.city || '',
            state: a.state || '',
            zip_code: a.zip_code || '',
        }))

        const completionPromise = xaiClient.chat.completions.create({
            model: 'grok-4-1-fast-reasoning',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: JSON.stringify(input) },
            ],
            temperature: 0.1,
        })

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Address cleaning timed out')), 30000)
        )

        const completion = await Promise.race([completionPromise, timeoutPromise])
        const text = completion.choices[0]?.message?.content || ''

        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(cleanJson)

        const results = Array.isArray(parsed) ? parsed : parsed.addresses || []

        if (results.length !== addresses.length) {
            // Fallback: return originals unchanged
            return NextResponse.json({
                addresses: addresses.map((a: any) => ({
                    ...a,
                    original_address: a.address,
                    was_corrected: false,
                    correction_notes: '',
                }))
            })
        }

        return NextResponse.json({
            addresses: results.map((r: any, i: number) => ({
                ...r,
                original_address: r.original_address || addresses[i].address,
            }))
        })
    } catch (error: any) {
        console.error('AI address cleaning error:', error.message)
        return NextResponse.json(
            { error: error.message || 'Address cleaning failed' },
            { status: 500 }
        )
    }
}
