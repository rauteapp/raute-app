import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MobileNav } from "@/components/mobile-nav";
import AuthCheck from "@/components/auth-check";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast-provider";
import { NetworkStatusBanner } from "@/components/network-status-banner";
import { WebSpeedInsights } from "@/components/web-speed-insights";
import { AuthListener } from "@/components/auth-listener";
import { StatusBarManager } from "@/components/status-bar-manager";
import { TrialGate } from "@/components/trial-gate";
import { ErrorBoundary } from "@/components/error-boundary";
import { ConfirmProvider } from "@/hooks/use-confirm";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Raute",
  description: "Route optimization and delivery management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Raute",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

import PwaElementsLoader from "@/components/pwa-elements-loader";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-background`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <PwaElementsLoader />
          <StatusBarManager />
          <NetworkStatusBanner />
          <ToastProvider>
            <ConfirmProvider>
            <AuthListener />
            <AuthCheck>
              <ErrorBoundary>
              <TrialGate>
                <div className="min-h-screen flex flex-col pt-safe px-safe">
                  <main className="flex-1 pb-32 mb-10 safe-area-pb">
                    {children}
                  </main>
                  <MobileNav />
                </div>
              </TrialGate>
              </ErrorBoundary>
            </AuthCheck>
          </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
        <WebSpeedInsights />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator && !window.Capacitor) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function() {});
              navigator.serviceWorker.addEventListener('message', function(e) {
                if (e.data && e.data.type === 'PROCESS_OFFLINE_QUEUE') {
                  window.dispatchEvent(new CustomEvent('process-offline-queue'));
                }
              });
            });
          }
        `}} />
      </body>
    </html>
  );
}
