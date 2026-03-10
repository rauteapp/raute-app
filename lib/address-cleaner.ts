import { authenticatedFetch } from './authenticated-fetch';

export interface AddressInput {
  address: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface CleanedAddress extends AddressInput {
  original_address: string;
  was_corrected: boolean;
  correction_notes: string;
}

/**
 * Clean addresses using xAI/Grok via server-side proxy.
 * API key stays on the server — never exposed to the browser.
 */
export async function cleanAddressesWithAI(
  addresses: AddressInput[]
): Promise<CleanedAddress[]> {
  if (!addresses.length) return [];

  try {
    const response = await authenticatedFetch('/api/ai/clean-address', {
      method: 'POST',
      body: JSON.stringify({ addresses }),
    });

    if (!response.ok) {
      console.warn('AI address cleaning failed:', response.status);
      return addresses.map((a) => ({
        ...a,
        original_address: a.address,
        was_corrected: false,
        correction_notes: '',
      }));
    }

    const data = await response.json();
    const results: CleanedAddress[] = data.addresses || [];

    // Validate array length matches input
    if (results.length !== addresses.length) {
      console.warn('AI returned mismatched count, falling back to originals');
      return addresses.map((a) => ({
        ...a,
        original_address: a.address,
        was_corrected: false,
        correction_notes: '',
      }));
    }

    return results;

  } catch (error) {
    console.error('AI address cleaning failed:', error);
    return addresses.map((a) => ({
      ...a,
      original_address: a.address,
      was_corrected: false,
      correction_notes: '',
    }));
  }
}
