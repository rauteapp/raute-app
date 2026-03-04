import OpenAI from "openai";
import { read, utils } from "xlsx";

// Initialize xAI Grok client (OpenAI-compatible API)
const apiKey = process.env.NEXT_PUBLIC_XAI_API_KEY || "";
const client = new OpenAI({
  apiKey,
  baseURL: "https://api.x.ai/v1",
  dangerouslyAllowBrowser: true, // Required for client-side usage in Next.js
});

export interface ParsedOrder {
  customer_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  customer_email: string;
  order_number: string;
  delivery_date: string;
  notes: string;
  priority_level?: 'normal' | 'high' | 'critical';
  time_window_start?: string;
  time_window_end?: string;
  weight_kg?: number | null;
}

/**
 * Convert a File to either a base64 image URL or extracted text (for spreadsheets).
 * Returns the appropriate content part for the OpenAI messages API.
 */
export async function fileToContentPart(
  file: File
): Promise<
  | { type: "image_url"; image_url: { url: string; detail: "high" } }
  | { type: "text"; text: string }
> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    // Check if it's an Excel/CSV file — extract text
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const csvText = utils.sheet_to_csv(worksheet);
          resolve({ type: "text", text: `SPREADSHEET DATA:\n${csvText}` });
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Handle images — convert to base64 data URL
      reader.onloadend = () => {
        const base64DataUrl = reader.result as string;
        resolve({
          type: "image_url",
          image_url: {
            url: base64DataUrl,
            detail: "high",
          },
        });
      };
      reader.readAsDataURL(file);
    }
    reader.onerror = reject;
  });
}

// Keep backward compatibility for any code importing the old name
export const fileToGenerativePart = fileToContentPart;

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
- customer_email (string): Customer's email address. Look for columns named "customer_email", "email", "customer email". If missing, use "".
- order_number (string)
- delivery_date (string): YYYY-MM-DD.
- notes (string)
- weight_kg (number|null): Package weight in kilograms. Look for columns named "weight_kg", "weight", "weight (kg)". If missing, use null.
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
`;

const MAX_RETRIES = 2;
const TIMEOUT_MS = 120_000; // 2 minutes — reasoning models can be slow on large inputs

async function callGrokWithRetry(
  contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  attempt = 1
): Promise<string> {
  try {
    const completionPromise = client.chat.completions.create({
      model: "grok-4-1-fast-reasoning",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contentParts },
      ],
      temperature: 0.1,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS)
    );

    const completion = await Promise.race([completionPromise, timeoutPromise]);
    const textResponse = completion.choices[0]?.message?.content || "";

    if (!textResponse) {
      throw new Error("The AI returned an empty response. Please try a different image.");
    }

    return textResponse;
  } catch (error: any) {
    const isRetryable =
      error.message === "TIMEOUT" ||
      error.code === "ERR_HTTP2_PROTOCOL_ERROR" ||
      error.status === 429 ||
      error.status === 502 ||
      error.status === 503 ||
      error.message?.includes("ERR_HTTP2") ||
      error.message?.includes("ECONNRESET") ||
      error.message?.includes("fetch failed");

    if (isRetryable && attempt <= MAX_RETRIES) {
      const delay = attempt * 3000; // 3s, 6s backoff
      await new Promise(r => setTimeout(r, delay));
      return callGrokWithRetry(contentParts, attempt + 1);
    }

    if (error.message === "TIMEOUT") {
      throw new Error("Request timed out. The AI model took too long to respond. Please try again or use a smaller image.");
    }

    throw error;
  }
}

export async function parseOrderAI(input: string | File | File[]): Promise<ParsedOrder[]> {
  if (!apiKey) {
    console.error("xAI API Key is missing");
    throw new Error("Configuration Error: xAI API Key is missing. Please check your .env settings.");
  }

  try {
    // Build the user message content parts
    const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    const dateContext = `Current Date: ${new Date().toISOString().split('T')[0]}`;

    if (typeof input === 'string') {
      contentParts.push({
        type: "text",
        text: `${dateContext}\n\nDATA TO EXTRACT FROM:\n\`\`\`text\n${input}\n\`\`\``,
      });
    } else if (Array.isArray(input)) {
      // Handle multiple files
      contentParts.push({ type: "text", text: dateContext });
      const parts = await Promise.all(input.map(file => fileToContentPart(file)));
      for (const part of parts) {
        contentParts.push(part);
      }
    } else {
      // Handle single file
      contentParts.push({ type: "text", text: dateContext });
      const part = await fileToContentPart(input);
      contentParts.push(part);
    }

    const textResponse = await callGrokWithRetry(contentParts);

    // Clean markdown code fences if present
    const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      throw new Error("Failed to parse AI response. The model returned malformed data.");
    }

    let orders: ParsedOrder[] = [];

    // Normalize output
    if (parsed.orders && Array.isArray(parsed.orders)) {
      orders = parsed.orders;
    } else if (Array.isArray(parsed)) {
      orders = parsed;
    } else if (parsed && typeof parsed === 'object') {
      // Single object case
      orders = [parsed] as ParsedOrder[];
    }

    if (orders.length === 0) {
      throw new Error("Processing complete, but no valid orders were found. Ensure the image text is legible.");
    }

    return orders;

  } catch (error: any) {
    console.error("Grok AI Error:", error);
    // Propagate the specific error message
    throw new Error(error.message || "An unexpected error occurred during AI processing.");
  }
}
