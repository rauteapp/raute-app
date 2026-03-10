import { read, utils } from "xlsx";
import { supabase } from "./supabase";

export interface ParsedOrder {
  customer_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  order_number: string;
  delivery_date: string;
  notes: string;
  priority_level?: 'normal' | 'high' | 'critical';
  time_window_start?: string;
  time_window_end?: string;
}

/**
 * Convert a File to either a base64 image URL or extracted text (for spreadsheets).
 * Returns the appropriate content part for the API.
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

/**
 * Parse orders using server-side AI API route.
 * The XAI API key is never exposed to the browser.
 */
export async function parseOrderAI(input: string | File | File[]): Promise<ParsedOrder[]> {
  try {
    // Build the content parts on the client (file reading only)
    const contentParts: any[] = [];
    const dateContext = `Current Date: ${new Date().toISOString().split('T')[0]}`;

    if (typeof input === 'string') {
      contentParts.push({
        type: "text",
        text: `${dateContext}\n\nDATA TO EXTRACT FROM:\n\`\`\`text\n${input}\n\`\`\``,
      });
    } else if (Array.isArray(input)) {
      contentParts.push({ type: "text", text: dateContext });
      const parts = await Promise.all(input.map(file => fileToContentPart(file)));
      for (const part of parts) {
        contentParts.push(part);
      }
    } else {
      contentParts.push({ type: "text", text: dateContext });
      const part = await fileToContentPart(input);
      contentParts.push(part);
    }

    // Get auth token for the API call
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      throw new Error("You must be logged in to use AI parsing.");
    }

    // Call server-side API route
    const response = await fetch('/api/ai/parse-orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ contentParts }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `AI request failed (${response.status})`);
    }

    const data = await response.json();

    if (!data.orders || data.orders.length === 0) {
      throw new Error("Processing complete, but no valid orders were found. Ensure the image text is legible.");
    }

    return data.orders;

  } catch (error: any) {
    console.error("AI Parse Error:", error);
    throw new Error(error.message || "An unexpected error occurred during AI processing.");
  }
}
