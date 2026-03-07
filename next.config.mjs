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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: *.supabase.co maps.googleapis.com maps.gstatic.com *.tile.openstreetmap.org",
      "font-src 'self' data:",
      "connect-src 'self' *.supabase.co api.x.ai maps.googleapis.com nominatim.openstreetmap.org api.resend.com",
      "media-src 'self' blob:",
      "frame-src 'self'",
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
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
