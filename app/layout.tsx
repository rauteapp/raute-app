import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MobileNav } from "@/components/mobile-nav";
import AuthCheck from "@/components/auth-check";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast-provider";
import { NetworkStatusBanner } from "@/components/network-status-banner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AuthListener } from "@/components/auth-listener";
import { StatusBarManager } from "@/components/status-bar-manager";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Raute",
  description: "Route optimization and delivery management",
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
  interactiveWidget: 'resizes-content', // Handles virtual keyboard gracefully
};

import PwaElementsLoader from "@/components/pwa-elements-loader";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-background`}>
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
            <AuthListener />
            <AuthCheck>
              <div className="min-h-screen flex flex-col pt-safe px-safe">
                <main className="flex-1 pb-32 mb-10 safe-area-pb">
                  {children}
                </main>
                <MobileNav />
              </div>
            </AuthCheck>
          </ToastProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
