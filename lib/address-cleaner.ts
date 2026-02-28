import OpenAI from "openai";

const apiKey = process.env.NEXT_PUBLIC_XAI_API_KEY || "";
const client = new OpenAI({
  apiKey,
  baseURL: "https://api.x.ai/v1",
  dangerouslyAllowBrowser: true,
});

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

IMPORTANT: Return ONLY the JSON array. No markdown, no explanation.`;

export async function cleanAddressesWithAI(
  addresses: AddressInput[]
): Promise<CleanedAddress[]> {
  if (!addresses.length) return [];
  if (!apiKey) {
    console.warn("⚠️ No XAI API key — skipping AI address cleaning");
    return addresses.map((a) => ({
      ...a,
      original_address: a.address,
      was_corrected: false,
      correction_notes: "",
    }));
  }

  try {
    const input = addresses.map((a) => ({
      address: a.address,
      city: a.city || "",
      state: a.state || "",
      zip_code: a.zip_code || "",
    }));

    const completionPromise = client.chat.completions.create({
      model: "grok-4-1-fast-reasoning",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input) },
      ],
      temperature: 0.1,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Address cleaning timed out")), 30000)
    );

    const completion = await Promise.race([completionPromise, timeoutPromise]);
    const text = completion.choices[0]?.message?.content || "";

    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    const results: CleanedAddress[] = Array.isArray(parsed) ? parsed : parsed.addresses || [];

    // Validate array length matches input
    if (results.length !== addresses.length) {
      console.warn("⚠️ AI returned mismatched count, falling back to originals");
      return addresses.map((a) => ({
        ...a,
        original_address: a.address,
        was_corrected: false,
        correction_notes: "",
      }));
    }

    // Ensure original_address is set
    return results.map((r, i) => ({
      ...r,
      original_address: r.original_address || addresses[i].address,
    }));
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
