import { supabase } from "./supabase";

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
 * Clean addresses using server-side AI API route.
 * The XAI API key is never exposed to the browser.
 */
export async function cleanAddressesWithAI(
  addresses: AddressInput[]
): Promise<CleanedAddress[]> {
  if (!addresses.length) return [];

  try {
    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      console.warn("⚠️ Not authenticated — skipping AI address cleaning");
      return addresses.map((a) => ({
        ...a,
        original_address: a.address,
        was_corrected: false,
        correction_notes: "",
      }));
    }

    const response = await fetch('/api/ai/clean-addresses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ addresses }),
    });

    if (!response.ok) {
      throw new Error(`Address cleaning failed (${response.status})`);
    }

    const data = await response.json();
    return data.addresses;

  } catch (error) {
    console.error("❌ AI address cleaning failed:", error);
    return addresses.map((a) => ({
      ...a,
      original_address: a.address,
      was_corrected: false,
      correction_notes: "",
    }));
  }
}
