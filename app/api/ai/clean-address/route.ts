import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/api-rate-limit'
import OpenAI from 'openai'

/**
 * POST /api/ai/clean-address
 *
 * Server-side proxy for xAI/Grok address cleaning.
 * Keeps XAI_API_KEY private (no NEXT_PUBLIC_ prefix).
 *
 * Body: { addresses: Array<{ address, city, state, zip_code }> }
 * Returns: { addresses: CleanedAddress[] }
 */

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

export async function POST(request: NextRequest) {
    // Rate limit: 20 req/60s per IP
    const rateLimited = checkRateLimit(request, { windowSeconds: 60, maxRequests: 20 })
    if (rateLimited) return rateLimited

    try {
        const authUser = await getAuthenticatedUser(request)
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const apiKey = process.env.XAI_API_KEY
        if (!apiKey) {
            return NextResponse.json(
                { error: 'xAI API key not configured on server' },
                { status: 500 }
            )
        }

        const { addresses } = await request.json()

        if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
            return NextResponse.json(
                { error: 'Missing or empty addresses array' },
                { status: 400 }
            )
        }

        if (addresses.length > 50) {
            return NextResponse.json(
                { error: 'Too many addresses (max 50 per request)' },
                { status: 400 }
            )
        }

        const client = new OpenAI({
            apiKey,
            baseURL: 'https://api.x.ai/v1',
        })

        const input = addresses.map((a: any) => ({
            address: a.address,
            city: a.city || '',
            state: a.state || '',
            zip_code: a.zip_code || '',
        }))

        const completionPromise = client.chat.completions.create({
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

        // Validate array length matches input
        if (results.length !== addresses.length) {
            return NextResponse.json(
                { error: 'AI returned mismatched result count', addresses: addresses.map((a: any) => ({
                    ...a,
                    original_address: a.address,
                    was_corrected: false,
                    correction_notes: '',
                })) },
                { status: 200 }
            )
        }

        // Ensure original_address is set
        const finalResults = results.map((r: any, i: number) => ({
            ...r,
            original_address: r.original_address || addresses[i].address,
        }))

        return NextResponse.json({ addresses: finalResults })
    } catch (err) {
        console.error('AI clean-address error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
