import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const isDev = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use static export for Capacitor/mobile builds
  ...(process.env.NEXT_PUBLIC_CAPACITOR_BUILD === 'true' && { output: 'export' }),
  images: { unoptimized: true },
  trailingSlash: true, // Required for reliable Capacitor routing (login/index.html)
  async headers() {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
      "script-src-elem 'self' 'unsafe-inline' https://vercel.live",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.googleapis.com https://unpkg.com https://cdnjs.cloudflare.com https://*.basemaps.cartocdn.com https://cdn-icons-png.flaticon.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.x.ai https://maps.googleapis.com https://nominatim.openstreetmap.org https://api.resend.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://vercel.live wss://vercel.live",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-src 'self' https://vercel.live",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];

    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      { key: 'Content-Security-Policy', value: cspDirectives.join('; ') },
    ];
    // HSTS only in production — on localhost it poisons the browser cache
    // and forces HTTPS which the dev server doesn't support
    if (!isDev) {
      securityHeaders.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' });
    }
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
