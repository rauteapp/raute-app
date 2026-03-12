import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Supabase Edge Function: send-push-notification
 *
 * Sends a push notification via Firebase Cloud Messaging HTTP v1 API.
 * Supports both user_id (looks up push_tokens table) and driver_id (legacy).
 *
 * POST body: { user_id?: string, driver_id?: string, title: string, body: string, data?: Record<string, string> }
 *
 * Required env vars:
 *   FIREBASE_CLIENT_EMAIL  — Firebase service account client email
 *   FIREBASE_PRIVATE_KEY   — Firebase service account private key (PEM format)
 *   SUPABASE_URL           — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
 */

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") || "raute-app";
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;

// ─── JWT helper: create a signed JWT for Google OAuth2 ───────────────────────

function base64url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToUint8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Import a PEM-encoded PKCS#8 private key for RS256 signing.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/**
 * Create a signed JWT for the Google OAuth2 token endpoint.
 */
async function createSignedJwt(
  clientEmail: string,
  privateKey: CryptoKey
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  const encodedHeader = base64url(textToUint8(JSON.stringify(header)));
  const encodedPayload = base64url(textToUint8(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    textToUint8(signingInput)
  );

  const encodedSignature = base64url(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

// ─── OAuth2 token cache ──────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(
  clientEmail: string,
  privateKeyPem: string
): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.token;
  }

  const privateKey = await importPrivateKey(privateKeyPem);
  const jwt = await createSignedJwt(clientEmail, privateKey);

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google OAuth2 token request failed: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

// ─── Main handler ────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { driver_id, user_id, title, body, data } = await req.json();

    if ((!driver_id && !user_id) || !title || !body) {
      return jsonResponse({ error: "Missing required fields: (driver_id or user_id), title, body" }, 400);
    }

    // Get env vars
    const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!clientEmail || !privateKey) {
      return jsonResponse({ error: "Firebase credentials not configured" }, 500);
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Supabase credentials not configured" }, 500);
    }

    // Look up push token
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let pushToken: string | null = null;
    let recipientName: string = "Unknown";

    if (user_id) {
      // Look up push token from push_tokens table (for any user type)
      const { data: tokenRow, error: tokenError } = await supabase
        .from("push_tokens")
        .select("token, platform")
        .eq("user_id", user_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tokenError) {
        console.error("push_tokens lookup error:", tokenError.message);
      }

      if (tokenRow?.token) {
        pushToken = tokenRow.token;
      }

      // Get user name for response
      const { data: userRow } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", user_id)
        .maybeSingle();

      // If no token in push_tokens, check if user is a driver with legacy push_token
      if (!pushToken) {
        const { data: driverRow } = await supabase
          .from("drivers")
          .select("push_token, name")
          .eq("user_id", user_id)
          .maybeSingle();

        if (driverRow?.push_token) {
          pushToken = driverRow.push_token;
        }
        recipientName = userRow?.full_name || driverRow?.name || "Unknown";
      } else {
        recipientName = userRow?.full_name || "Unknown";
      }
    } else if (driver_id) {
      // Legacy path: look up driver directly by driver_id
      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .select("push_token, platform, name, user_id")
        .eq("id", driver_id)
        .single();

      if (driverError || !driver) {
        return jsonResponse({ error: "Driver not found", details: driverError?.message }, 404);
      }

      recipientName = driver.name || "Unknown";

      // Try push_tokens table first (if driver has user_id), fall back to legacy field
      if (driver.user_id) {
        const { data: tokenRow } = await supabase
          .from("push_tokens")
          .select("token")
          .eq("user_id", driver.user_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        pushToken = tokenRow?.token || driver.push_token;
      } else {
        pushToken = driver.push_token;
      }
    }

    if (!pushToken) {
      return jsonResponse({ error: "No push token registered", recipient_name: recipientName }, 422);
    }

    // Get OAuth2 access token for FCM
    // The private key may have escaped newlines from env var — restore them
    const resolvedKey = privateKey.replace(/\\n/g, "\n");
    const accessToken = await getAccessToken(clientEmail, resolvedKey);

    // Build FCM v1 message
    const message: Record<string, unknown> = {
      message: {
        token: pushToken,
        notification: {
          title,
          body,
        },
        data: data || {},
        // Platform-specific config
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: "default",
              "content-available": 1,
            },
          },
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channel_id: "default",
          },
        },
      },
    };

    // Send via FCM HTTP v1 API
    const fcmResp = await fetch(FCM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const fcmData = await fcmResp.json();

    if (!fcmResp.ok) {
      console.error("FCM send failed:", JSON.stringify(fcmData));
      return jsonResponse({ error: "FCM send failed", status: fcmResp.status, details: fcmData }, 502);
    }

    return jsonResponse({ success: true, message_name: fcmData.name, recipient_name: recipientName }, 200);
  } catch (err) {
    console.error("Edge function error:", err);
    return jsonResponse({ error: "Internal error", details: String(err) }, 500);
  }
});
