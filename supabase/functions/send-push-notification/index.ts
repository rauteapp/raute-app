import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Supabase Edge Function: send-push-notification
 *
 * Sends a push notification to a driver via Firebase Cloud Messaging HTTP v1 API.
 *
 * POST body: { driver_id: string, title: string, body: string, data?: Record<string, string> }
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

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { driver_id, title, body, data } = await req.json();

    if (!driver_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: driver_id, title, body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get env vars
    const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!clientEmail || !privateKey) {
      return new Response(
        JSON.stringify({ error: "Firebase credentials not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Supabase credentials not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Look up driver's push token
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("push_token, platform, name")
      .eq("id", driver_id)
      .single();

    if (driverError || !driver) {
      return new Response(
        JSON.stringify({ error: "Driver not found", details: driverError?.message }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!driver.push_token) {
      return new Response(
        JSON.stringify({
          error: "Driver has no push token registered",
          driver_name: driver.name,
        }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get OAuth2 access token for FCM
    // The private key may have escaped newlines from env var — restore them
    const resolvedKey = privateKey.replace(/\\n/g, "\n");
    const accessToken = await getAccessToken(clientEmail, resolvedKey);

    // Build FCM v1 message
    const message: Record<string, unknown> = {
      message: {
        token: driver.push_token,
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
      return new Response(
        JSON.stringify({
          error: "FCM send failed",
          status: fcmResp.status,
          details: fcmData,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_name: fcmData.name,
        driver_name: driver.name,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
