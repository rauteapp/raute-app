import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use static export for Capacitor/mobile builds
  ...(process.env.NEXT_PUBLIC_CAPACITOR_BUILD === 'true' && { output: 'export' }),
  images: { unoptimized: true },
  trailingSlash: true, // Required for reliable Capacitor routing (login/index.html)
  // CSP headers are defined in vercel.json to avoid duplicate header issues
  async headers() {
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
    ];
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
