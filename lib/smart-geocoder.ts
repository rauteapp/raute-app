import { cleanAddressesWithAI } from './address-cleaner'

export interface SmartGeocodeResult {
    lat: number
    lng: number
    confidence: 'exact' | 'approximate' | 'low'
    foundAddress: string
    strategy: string
    correctedAddress?: string // If AI corrected the address
}

/**
 * Strip apartment/suite/room/unit numbers from an address.
 * Returns the cleaned street address.
 */
function stripUnitNumber(address: string): string {
    return address
        .replace(/\b(apt|apartment|suite|ste|unit|rm|room|bldg|building|fl|floor|#)\s*\.?\s*\S+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
}

/**
 * Try geocoding with Google Maps API.
 */
async function tryGoogle(query: string): Promise<{ lat: number; lng: number; confidence: 'exact' | 'approximate' | 'low'; foundAddress: string } | null> {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) return null

    try {
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
        )
        const data = await response.json()

        if (data.status === 'OK' && data.results?.length > 0) {
            const result = data.results[0]
            const locationType = result.geometry.location_type

            let confidence: 'exact' | 'approximate' | 'low' = 'low'
            if (locationType === 'ROOFTOP') confidence = 'exact'
            else if (locationType === 'RANGE_INTERPOLATED') confidence = 'approximate'

            return {
                lat: result.geometry.location.lat,
                lng: result.geometry.location.lng,
                confidence,
                foundAddress: result.formatted_address
            }
        }
    } catch { /* silent */ }
    return null
}

/**
 * Try geocoding with Nominatim (OpenStreetMap).
 */
async function tryNominatim(query: string): Promise<{ lat: number; lng: number; confidence: 'exact' | 'approximate' | 'low'; foundAddress: string } | null> {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
            { headers: { 'User-Agent': 'Raute Delivery App' } }
        )
        const data = await response.json()

        if (data?.length > 0) {
            const result = data[0]
            const addr = result.address || {}

            let confidence: 'exact' | 'approximate' | 'low' = 'low'
            if (addr.house_number) confidence = 'exact'
            else if (addr.road || addr.street) confidence = 'approximate'

            return {
                lat: parseFloat(result.lat),
                lng: parseFloat(result.lon),
                confidence,
                foundAddress: result.display_name
            }
        }
    } catch { /* silent */ }
    return null
}

/**
 * Smart geocoder — tries multiple strategies from fast/free to slow/paid.
 *
 * Strategy ladder:
 * 1. Raw address → Google Maps (fastest, most accurate)
 * 2. Partial address (strip apt/room) → Google Maps
 * 3. Raw address → Nominatim (free fallback)
 * 4. Partial address → Nominatim
 * 5. AI clean → Google Maps (expensive, last resort)
 * 6. City + State + Zip → Google Maps (city-level fallback)
 */
export async function smartGeocode(
    address: string,
    city: string,
    state: string,
    zipCode: string
): Promise<SmartGeocodeResult | null> {
    const rawQuery = [address, city, state, zipCode].filter(Boolean).join(', ')
    if (!rawQuery.trim()) return null

    // Strategy 1: Raw address → Google
    const g1 = await tryGoogle(rawQuery)
    if (g1 && g1.confidence !== 'low') {
        return { ...g1, strategy: 'google_raw' }
    }

    // Strategy 2: Partial address (strip unit numbers) → Google
    const stripped = stripUnitNumber(address)
    if (stripped !== address && stripped.length > 3) {
        const partialQuery = [stripped, city, state, zipCode].filter(Boolean).join(', ')
        const g2 = await tryGoogle(partialQuery)
        if (g2 && g2.confidence !== 'low') {
            return { ...g2, strategy: 'google_partial' }
        }
    }

    // Strategy 3: Raw address → Nominatim
    const n1 = await tryNominatim(rawQuery)
    if (n1 && n1.confidence !== 'low') {
        return { ...n1, strategy: 'nominatim_raw' }
    }

    // Strategy 4: Partial address → Nominatim
    if (stripped !== address && stripped.length > 3) {
        const partialQuery = [stripped, city, state, zipCode].filter(Boolean).join(', ')
        const n2 = await tryNominatim(partialQuery)
        if (n2 && n2.confidence !== 'low') {
            return { ...n2, strategy: 'nominatim_partial' }
        }
    }

    // Strategy 5: AI clean → Google (expensive, only if all above failed)
    try {
        const cleaned = await cleanAddressesWithAI([{ address, city, state, zip_code: zipCode }])
        if (cleaned[0]?.was_corrected) {
            const aiQuery = [cleaned[0].address, cleaned[0].city, cleaned[0].state, cleaned[0].zip_code].filter(Boolean).join(', ')
            const g3 = await tryGoogle(aiQuery)
            if (g3) {
                return {
                    ...g3,
                    strategy: 'ai_cleaned',
                    correctedAddress: cleaned[0].address
                }
            }
            // Also try AI-cleaned with Nominatim
            const n3 = await tryNominatim(aiQuery)
            if (n3) {
                return {
                    ...n3,
                    strategy: 'ai_cleaned_nominatim',
                    correctedAddress: cleaned[0].address
                }
            }
        }
    } catch { /* AI failed, continue */ }

    // Strategy 6: City-level fallback — at least get approximate location
    if (city || zipCode) {
        const cityQuery = [city, state, zipCode].filter(Boolean).join(', ')
        const g4 = await tryGoogle(cityQuery)
        if (g4) {
            return { ...g4, confidence: 'low', strategy: 'city_fallback' }
        }
    }

    // Accept any low-confidence result we got earlier
    if (g1) return { ...g1, strategy: 'google_raw_low' }
    if (n1) return { ...n1, strategy: 'nominatim_raw_low' }

    return null
}

/**
 * Batch smart geocode — for bulk imports.
 * Tries fast strategies first for all, then AI-cleans only the failures.
 */
export async function batchSmartGeocode(
    addresses: Array<{ address: string; city: string; state: string; zip_code: string }>
): Promise<(SmartGeocodeResult | null)[]> {
    const results: (SmartGeocodeResult | null)[] = new Array(addresses.length).fill(null)
    const failedIndices: number[] = []

    // Phase 1: Try fast strategies (Google raw + partial) for all
    for (let i = 0; i < addresses.length; i++) {
        const { address, city, state, zip_code } = addresses[i]
        const rawQuery = [address, city, state, zip_code].filter(Boolean).join(', ')

        // Try Google raw
        const g1 = await tryGoogle(rawQuery)
        if (g1 && g1.confidence !== 'low') {
            results[i] = { ...g1, strategy: 'google_raw' }
            continue
        }

        // Try partial
        const stripped = stripUnitNumber(address)
        if (stripped !== address && stripped.length > 3) {
            const partialQuery = [stripped, city, state, zip_code].filter(Boolean).join(', ')
            const g2 = await tryGoogle(partialQuery)
            if (g2 && g2.confidence !== 'low') {
                results[i] = { ...g2, strategy: 'google_partial' }
                continue
            }
        }

        // Try Nominatim
        const n1 = await tryNominatim(rawQuery)
        if (n1 && n1.confidence !== 'low') {
            results[i] = { ...n1, strategy: 'nominatim_raw' }
            continue
        }

        // Store low-confidence result but mark as needing AI
        results[i] = g1 ? { ...g1, strategy: 'google_raw_low' } : n1 ? { ...n1, strategy: 'nominatim_raw_low' } : null
        failedIndices.push(i)
    }

    // Phase 2: AI-clean ONLY the failures (one batch call)
    if (failedIndices.length > 0) {
        try {
            const failedAddresses = failedIndices.map(i => addresses[i])
            const cleaned = await cleanAddressesWithAI(failedAddresses)

            for (let j = 0; j < failedIndices.length; j++) {
                const idx = failedIndices[j]
                const c = cleaned[j]
                if (!c?.was_corrected) continue

                const aiQuery = [c.address, c.city, c.state, c.zip_code].filter(Boolean).join(', ')
                const g3 = await tryGoogle(aiQuery)
                if (g3) {
                    results[idx] = { ...g3, strategy: 'ai_cleaned', correctedAddress: c.address }
                    continue
                }
                const n3 = await tryNominatim(aiQuery)
                if (n3) {
                    results[idx] = { ...n3, strategy: 'ai_cleaned_nominatim', correctedAddress: c.address }
                }
            }
        } catch { /* AI batch failed, keep whatever we have */ }

        // Phase 3: City-level fallback for anything still null
        for (const idx of failedIndices) {
            if (results[idx] && results[idx]!.confidence !== 'low') continue
            const { city, state, zip_code } = addresses[idx]
            if (city || zip_code) {
                const cityQuery = [city, state, zip_code].filter(Boolean).join(', ')
                const g4 = await tryGoogle(cityQuery)
                if (g4) {
                    results[idx] = { ...g4, confidence: 'low', strategy: 'city_fallback' }
                }
            }
        }
    }

    return results
}
