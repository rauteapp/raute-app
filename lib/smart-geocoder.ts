import { cleanAddressesWithAI } from './address-cleaner'
import { authenticatedFetch } from './authenticated-fetch'

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
 * Try geocoding with server-side Google Maps proxy.
 * API key stays on the server — never exposed to the browser.
 */
async function tryGoogle(query: string): Promise<{ lat: number; lng: number; confidence: 'exact' | 'approximate' | 'low'; foundAddress: string } | null> {
    try {
        const response = await authenticatedFetch('/api/geocode', {
            method: 'POST',
            body: JSON.stringify({ address: query }),
        })

        if (!response.ok) return null

        const data = await response.json()
        return {
            lat: data.lat,
            lng: data.lng,
            confidence: data.confidence,
            foundAddress: data.foundAddress,
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
 * Smart geocoder — tries FREE strategies first, then paid fallbacks.
 * This order saves ~70% on Google Maps API costs.
 *
 * Strategy ladder (cost-optimized):
 * 1. Raw address → Nominatim (FREE, handles ~60-70% of US addresses)
 * 2. Partial address (strip apt/room) → Nominatim (FREE)
 * 3. Raw address → Google Maps (paid, more accurate fallback)
 * 4. Partial address → Google Maps (paid)
 * 5. AI clean → Nominatim then Google (expensive, last resort)
 * 6. City + State + Zip → Nominatim then Google (city-level fallback)
 */
export async function smartGeocode(
    address: string,
    city: string,
    state: string,
    zipCode: string
): Promise<SmartGeocodeResult | null> {
    const rawQuery = [address, city, state, zipCode].filter(Boolean).join(', ')
    if (!rawQuery.trim()) return null

    const stripped = stripUnitNumber(address)
    const partialQuery = stripped !== address && stripped.length > 3
        ? [stripped, city, state, zipCode].filter(Boolean).join(', ')
        : null

    // Strategy 1: Raw address → Nominatim (FREE)
    const n1 = await tryNominatim(rawQuery)
    if (n1 && n1.confidence !== 'low') {
        return { ...n1, strategy: 'nominatim_raw' }
    }

    // Strategy 2: Partial address → Nominatim (FREE)
    if (partialQuery) {
        const n2 = await tryNominatim(partialQuery)
        if (n2 && n2.confidence !== 'low') {
            return { ...n2, strategy: 'nominatim_partial' }
        }
    }

    // Strategy 3: Raw address → Google (paid fallback)
    const g1 = await tryGoogle(rawQuery)
    if (g1 && g1.confidence !== 'low') {
        return { ...g1, strategy: 'google_raw' }
    }

    // Strategy 4: Partial address → Google (paid fallback)
    if (partialQuery) {
        const g2 = await tryGoogle(partialQuery)
        if (g2 && g2.confidence !== 'low') {
            return { ...g2, strategy: 'google_partial' }
        }
    }

    // Strategy 5: AI clean → Nominatim then Google (expensive, last resort)
    try {
        const cleaned = await cleanAddressesWithAI([{ address, city, state, zip_code: zipCode }])
        if (cleaned[0]?.was_corrected) {
            const aiQuery = [cleaned[0].address, cleaned[0].city, cleaned[0].state, cleaned[0].zip_code].filter(Boolean).join(', ')
            // Try Nominatim first with AI-cleaned address (FREE)
            const n3 = await tryNominatim(aiQuery)
            if (n3) {
                return {
                    ...n3,
                    strategy: 'ai_cleaned_nominatim',
                    correctedAddress: cleaned[0].address
                }
            }
            // Then Google as fallback (paid)
            const g3 = await tryGoogle(aiQuery)
            if (g3) {
                return {
                    ...g3,
                    strategy: 'ai_cleaned',
                    correctedAddress: cleaned[0].address
                }
            }
        }
    } catch { /* AI failed, continue */ }

    // Strategy 6: City-level fallback — Nominatim first, then Google
    if (city || zipCode) {
        const cityQuery = [city, state, zipCode].filter(Boolean).join(', ')
        const n4 = await tryNominatim(cityQuery)
        if (n4) {
            return { ...n4, confidence: 'low', strategy: 'city_fallback_nominatim' }
        }
        const g4 = await tryGoogle(cityQuery)
        if (g4) {
            return { ...g4, confidence: 'low', strategy: 'city_fallback' }
        }
    }

    // Accept any low-confidence result we got earlier (prefer free)
    if (n1) return { ...n1, strategy: 'nominatim_raw_low' }
    if (g1) return { ...g1, strategy: 'google_raw_low' }

    return null
}

/**
 * Batch smart geocode — for bulk imports.
 * Tries FREE Nominatim first for all, then paid Google for failures,
 * then AI-cleans only the remaining failures.
 */
export async function batchSmartGeocode(
    addresses: Array<{ address: string; city: string; state: string; zip_code: string }>
): Promise<(SmartGeocodeResult | null)[]> {
    const results: (SmartGeocodeResult | null)[] = new Array(addresses.length).fill(null)
    const needsGoogleIndices: number[] = []

    // Phase 1: Try Nominatim (FREE) for all addresses first
    for (let i = 0; i < addresses.length; i++) {
        const { address, city, state, zip_code } = addresses[i]
        const rawQuery = [address, city, state, zip_code].filter(Boolean).join(', ')

        // Try Nominatim raw (FREE)
        const n1 = await tryNominatim(rawQuery)
        if (n1 && n1.confidence !== 'low') {
            results[i] = { ...n1, strategy: 'nominatim_raw' }
            continue
        }

        // Try Nominatim partial (FREE)
        const stripped = stripUnitNumber(address)
        if (stripped !== address && stripped.length > 3) {
            const partialQuery = [stripped, city, state, zip_code].filter(Boolean).join(', ')
            const n2 = await tryNominatim(partialQuery)
            if (n2 && n2.confidence !== 'low') {
                results[i] = { ...n2, strategy: 'nominatim_partial' }
                continue
            }
        }

        // Store low-confidence Nominatim result, mark for Google fallback
        results[i] = n1 ? { ...n1, strategy: 'nominatim_raw_low' } : null
        needsGoogleIndices.push(i)
    }

    // Phase 2: Try Google (PAID) only for addresses Nominatim couldn't resolve
    const failedIndices: number[] = []
    for (const i of needsGoogleIndices) {
        const { address, city, state, zip_code } = addresses[i]
        const rawQuery = [address, city, state, zip_code].filter(Boolean).join(', ')

        const g1 = await tryGoogle(rawQuery)
        if (g1 && g1.confidence !== 'low') {
            results[i] = { ...g1, strategy: 'google_raw' }
            continue
        }

        const stripped = stripUnitNumber(address)
        if (stripped !== address && stripped.length > 3) {
            const partialQuery = [stripped, city, state, zip_code].filter(Boolean).join(', ')
            const g2 = await tryGoogle(partialQuery)
            if (g2 && g2.confidence !== 'low') {
                results[i] = { ...g2, strategy: 'google_partial' }
                continue
            }
        }

        // Store Google low-confidence (better than Nominatim low)
        if (g1) results[i] = { ...g1, strategy: 'google_raw_low' }
        failedIndices.push(i)
    }

    // Phase 3: AI-clean ONLY the remaining failures (one batch call)
    if (failedIndices.length > 0) {
        try {
            const failedAddresses = failedIndices.map(i => addresses[i])
            const cleaned = await cleanAddressesWithAI(failedAddresses)

            for (let j = 0; j < failedIndices.length; j++) {
                const idx = failedIndices[j]
                const c = cleaned[j]
                if (!c?.was_corrected) continue

                const aiQuery = [c.address, c.city, c.state, c.zip_code].filter(Boolean).join(', ')
                // Try Nominatim first with AI-cleaned (FREE)
                const n3 = await tryNominatim(aiQuery)
                if (n3) {
                    results[idx] = { ...n3, strategy: 'ai_cleaned_nominatim', correctedAddress: c.address }
                    continue
                }
                // Then Google (PAID)
                const g3 = await tryGoogle(aiQuery)
                if (g3) {
                    results[idx] = { ...g3, strategy: 'ai_cleaned', correctedAddress: c.address }
                }
            }
        } catch { /* AI batch failed, keep whatever we have */ }

        // Phase 4: City-level fallback — Nominatim first, then Google
        for (const idx of failedIndices) {
            if (results[idx] && results[idx]!.confidence !== 'low') continue
            const { city, state, zip_code } = addresses[idx]
            if (city || zip_code) {
                const cityQuery = [city, state, zip_code].filter(Boolean).join(', ')
                const n4 = await tryNominatim(cityQuery)
                if (n4) {
                    results[idx] = { ...n4, confidence: 'low', strategy: 'city_fallback_nominatim' }
                    continue
                }
                const g4 = await tryGoogle(cityQuery)
                if (g4) {
                    results[idx] = { ...g4, confidence: 'low', strategy: 'city_fallback' }
                }
            }
        }
    }

    return results
}
