/**
 * Geocoding Utility using OpenStreetMap Nominatim API
 * 
 * This utility provides address-to-coordinates conversion (geocoding)
 * using the free OpenStreetMap Nominatim service.
 * 
 * Rate Limit: Max 1 request per second (enforced by Nominatim usage policy)
 * No API key required
 */

export interface GeocodingResult {
    lat: number;
    lng: number;
    displayAddress: string;
    // New fields
    confidence: 'exact' | 'approximate' | 'low';
    foundAddress: string;
    originalQuery: string;
}

// Rate limiting: Track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second in milliseconds

/**
 * Geocode an address to coordinates using OpenStreetMap Nominatim API
 * 
 * @param address - The address to geocode (e.g., "123 Main St, Los Angeles, CA")
 * @returns Promise with coordinates and formatted address, or null if not found
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
    if (!address || address.trim().length === 0) {
        console.error('❌ [Geocoding] Empty address provided');
        return null;
    }

    try {
        // Rate limiting: Wait if needed to comply with Nominatim usage policy
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        lastRequestTime = Date.now();

        // Build Nominatim API URL
        const params = new URLSearchParams({
            q: address.trim(),
            format: 'json',
            limit: '1',
            addressdetails: '1'
        });

        const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

        // Make request with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'RouteApp/1.0' // Nominatim requires User-Agent header
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`❌ [Geocoding] API request failed: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();

        if (!data || data.length === 0) {
            return null;
        }

        const result = data[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        const addressDetails = result.address || {};

        // Calculate Confidence
        let confidence: 'exact' | 'approximate' | 'low' = 'low';

        // EXACT: Has house number
        if (addressDetails.house_number) {
            confidence = 'exact';
        }
        // APPROXIMATE: Has road/street but no house number
        else if (addressDetails.road || addressDetails.street || addressDetails.pedestrian) {
            confidence = 'approximate';
        }
        // LOW: Just city/state/postcode level, no street info
        else {
            confidence = 'low';
        }

        // Build display address from response
        const displayAddress = result.display_name || address;

        return {
            lat,
            lng,
            displayAddress,
            confidence,
            foundAddress: displayAddress,
            originalQuery: address
        };

    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error('❌ [Geocoding] Request timed out');
        } else {
            console.error('❌ [Geocoding] Error:', error.message || error);
        }
        return null;
    }
}

export interface ReverseGeocodeResult {
    address: string;
    city: string;
    state: string;
    zip: string;
    fullAddress: string;
}

/**
 * Reverse geocode coordinates to an address
 * 
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Promise with address components, or null if not found
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    if (!lat || !lng) {
        console.error('❌ [Reverse Geocoding] Invalid coordinates provided');
        return null;
    }

    try {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        lastRequestTime = Date.now();

        const params = new URLSearchParams({
            lat: lat.toString(),
            lon: lng.toString(),
            format: 'json',
            addressdetails: '1'
        });

        const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'RouteApp/1.0'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`❌ [Reverse Geocoding] API request failed: ${response.status}`);
            return null;
        }

        const data = await response.json();

        if (!data || !data.display_name) {
            return null;
        }

        // Extract address components
        const addressData = data.address || {};

        const address = addressData.road || addressData.street || addressData.pedestrian || '';
        const city = addressData.city || addressData.town || addressData.village || addressData.hamlet || '';
        const state = addressData.state || '';
        const zip = addressData.postcode || '';

        return {
            address,
            city,
            state,
            zip,
            fullAddress: data.display_name
        };

    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error('❌ [Reverse Geocoding] Request timed out');
        } else {
            console.error('❌ [Reverse Geocoding] Error:', error.message || error);
        }
        return null;
    }
}
