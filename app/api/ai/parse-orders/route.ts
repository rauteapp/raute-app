import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/api-rate-limit'
import OpenAI from 'openai'

/**
 * POST /api/ai/parse-orders
 *
 * Server-side proxy for xAI/Grok order parsing.
 * Keeps XAI_API_KEY private (no NEXT_PUBLIC_ prefix).
 *
 * Body: { contentParts: OpenAI content parts array }
 * Returns: { orders: ParsedOrder[] }
 */

const SYSTEM_PROMPT = `
You are an AI assistant for a delivery logistics app.
Your task is to extract delivery order details from the provided input (text or image).
The input might be a chat message, an email, a screenshot of a list, or a spreadsheet row.

IMPORTANT: Your goal is to extract as many valid orders as possible.
It is common for some details (like Customer Name, Phone, or Notes) to be missing. This is ACCEPTABLE.
- ALways extract the Address.
- If other fields are present, extract them.
- If a field is MISSING in the input, explicitly return an empty string "" (do not hallucinate).
- Treat each address found as a separate order.

Extract the orders and return them as a JSON OBJECT with a key "orders" containing an ARRAY of objects.
Example: { "orders": [ { "customer_name": "John", "address": "123 Main St", "priority_level": "normal", "time_window_start": "09:00", "time_window_end": "12:00" } ] }

Fields to extract for each order:
- customer_name (string): Name of the recipient. If missing, use "".
- address (string): Full street address.
- city (string)
- state (string)
- zip_code (string)
- phone (string)
- order_number (string)
- delivery_date (string): YYYY-MM-DD.
- notes (string)
- priority_level (string): 'normal', 'high', or 'critical'. Infer from keywords:
    - 'Critical', 'Emergency', 'Life Threatening' -> 'critical'
    - 'High', 'Urgent', 'ASAP', 'Rush' -> 'high'
    - Otherwise 'normal'.
- time_window_start (string): HH:MM (24h format). Start of delivery window. Empty if none.
- time_window_end (string): HH:MM (24h format). End of delivery window. Empty if none.
    - Examples:
    - "Deliver by 5pm" -> start: "", end: "17:00"
    - "Window 9am - 1pm" -> start: "09:00", end: "13:00"
    - "After 14:00" -> start: "14:00", end: ""
    - "At 10:30" -> start: "10:15", end: "10:45" (approx window)

If a field is missing, use "".
RETURN ONLY THE RAW JSON.
`

const MAX_RETRIES = 2
const TIMEOUT_MS = 120_000

export async function POST(request: NextRequest) {
    // Rate limit: 10 req/60s per IP
    const rateLimited = checkRateLimit(request, { windowSeconds: 60, maxRequests: 10 })
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

        const { contentParts } = await request.json()

        if (!contentParts || !Array.isArray(contentParts) || contentParts.length === 0) {
            return NextResponse.json(
                { error: 'Missing or empty contentParts array' },
                { status: 400 }
            )
        }

        const client = new OpenAI({
            apiKey,
            baseURL: 'https://api.x.ai/v1',
        })

        const textResponse = await callWithRetry(client, contentParts)

        // Clean markdown code fences if present
        const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim()

        let parsed
        try {
            parsed = JSON.parse(cleanJson)
        } catch {
            return NextResponse.json(
                { error: 'Failed to parse AI response' },
                { status: 502 }
            )
        }

        // Normalize output
        let orders = []
        if (parsed.orders && Array.isArray(parsed.orders)) {
            orders = parsed.orders
        } else if (Array.isArray(parsed)) {
            orders = parsed
        } else if (parsed && typeof parsed === 'object') {
            orders = [parsed]
        }

        return NextResponse.json({ orders })
    } catch (err) {
        console.error('AI parse-orders error:', err)
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        )
    }
}

async function callWithRetry(
    client: OpenAI,
    contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
    attempt = 1
): Promise<string> {
    try {
        const completionPromise = client.chat.completions.create({
            model: 'grok-4-1-fast-reasoning',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: contentParts },
            ],
            temperature: 0.1,
        })

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
        )

        const completion = await Promise.race([completionPromise, timeoutPromise])
        const text = completion.choices[0]?.message?.content || ''

        if (!text) {
            throw new Error('The AI returned an empty response.')
        }

        return text
    } catch (error: any) {
        const isRetryable =
            error.message === 'TIMEOUT' ||
            error.status === 429 ||
            error.status === 502 ||
            error.status === 503 ||
            error.message?.includes('ECONNRESET') ||
            error.message?.includes('fetch failed')

        if (isRetryable && attempt <= MAX_RETRIES) {
            const delay = attempt * 3000
            await new Promise(r => setTimeout(r, delay))
            return callWithRetry(client, contentParts, attempt + 1)
        }

        if (error.message === 'TIMEOUT') {
            throw new Error('Request timed out. Please try again or use a smaller image.')
        }

        throw error
    }
}
