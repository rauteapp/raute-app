'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/landing/navbar'
import { HeroSection } from '@/components/landing/hero-section'
import { FeaturesGrid } from '@/components/landing/features-grid'
import { CtaBanner } from '@/components/landing/cta-banner'
import { HowItWorks } from '@/components/landing/how-it-works'
import { PricingSection } from '@/components/landing/pricing-section'
import { FAQSection } from '@/components/landing/faq-section'
import { DownloadSection } from '@/components/landing/download-section'
import { ContactForm } from '@/components/landing/contact-form'
import { Footer } from '@/components/landing/footer'

export default function LandingPage() {
  const router = useRouter()
  // Default to loading to prevent flash of content on mobile
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Redirect mobile users (Capacitor) to login page
    const checkMobile = async () => {
      let isNative = false
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        // Check if it's actually native platform (iOS/Android) not just web with Capacitor injected
        isNative = (window as any).Capacitor.isNativePlatform?.() ||
          (window as any).Capacitor.getPlatform?.() !== 'web';

        if (isNative) {
          router.push('/login')
          return // Keep loading true while redirecting
        }
      }

      // Only show content if NOT native
      setIsLoading(false)
    }
    checkMobile()
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-4 safe-area-p">
        <div className="text-center space-y-4 animate-pulse">
          <div className="h-12 w-12 bg-slate-200 dark:bg-slate-800 rounded-xl mx-auto" />
          <div className="h-5 w-36 bg-slate-200 dark:bg-slate-800 rounded mx-auto" />
          <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans selection:bg-blue-100 dark:selection:bg-blue-900 safe-area-pl safe-area-pr">

      {/* Navigation */}
      <Navbar />

      <main>
        {/* 1. Hero Section */}
        <HeroSection />

        {/* 2. Features Showcase */}
        <FeaturesGrid />

        {/* 4. CTA Banner (conversion nudge) */}
        <CtaBanner />

        {/* 5. How It Works */}
        <HowItWorks />

        {/* 6. Pricing Plans */}
        <PricingSection />

        {/* 7. FAQ */}
        <FAQSection />

        {/* 8. Download App */}
        <DownloadSection />

        {/* 9. Contact Form */}
        <ContactForm />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
