import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/api-rate-limit'

/**
 * POST /api/geocode
 *
 * Server-side proxy for Google Maps Geocoding API.
 * Keeps GOOGLE_MAPS_API_KEY private (no NEXT_PUBLIC_ prefix).
 *
 * Body: { address: string }
 * Returns: { lat, lng, confidence, foundAddress } or error
 */
export async function POST(request: NextRequest) {
    // Rate limit: 30 req/60s per IP
    const rateLimited = checkRateLimit(request, { windowSeconds: 60, maxRequests: 30 })
    if (rateLimited) return rateLimited

    try {
        // Auth check
        const authUser = await getAuthenticatedUser(request)
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { address } = await request.json()

        if (!address || typeof address !== 'string' || address.trim().length < 3) {
            return NextResponse.json(
                { error: 'Missing or invalid address (min 3 characters)' },
                { status: 400 }
            )
        }

        if (address.length > 500) {
            return NextResponse.json(
                { error: 'Address too long (max 500 characters)' },
                { status: 400 }
            )
        }

        const apiKey = process.env.GOOGLE_MAPS_API_KEY
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Google Maps API key not configured on server' },
                { status: 500 }
            )
        }

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address.trim())}&key=${apiKey}`
        )
        const data = await response.json()

        if (data.status === 'OK' && data.results?.length > 0) {
            const result = data.results[0]
            const locationType = result.geometry.location_type

            let confidence: 'exact' | 'approximate' | 'low' = 'low'
            if (locationType === 'ROOFTOP') confidence = 'exact'
            else if (locationType === 'RANGE_INTERPOLATED') confidence = 'approximate'

            return NextResponse.json({
                lat: result.geometry.location.lat,
                lng: result.geometry.location.lng,
                confidence,
                foundAddress: result.formatted_address,
            })
        }

        return NextResponse.json({ error: 'No results found', status: data.status }, { status: 404 })
    } catch (err) {
        console.error('Geocode proxy error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
