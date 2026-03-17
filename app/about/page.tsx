import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Target, Users, Zap } from 'lucide-react'

export const metadata: Metadata = {
  title: 'About Us | Raute',
  description: 'Learn about Raute — the intelligent route planning platform built for modern delivery fleets.',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-6 py-12 safe-area-p">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          About Raute
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mb-10">
          Optimizing the last mile, one delivery at a time.
        </p>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Our Mission</h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Raute was built with a simple mission: to make last-mile delivery effortless for businesses of all sizes.
              We believe that small and mid-sized logistics companies deserve the same powerful tools that enterprise
              corporations use — without the enterprise price tag.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">What We Do</h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              Raute is an all-in-one fleet management platform that combines AI-powered route optimization,
              real-time GPS tracking, smart order parsing, and a driver mobile app into one seamless experience.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-center">
                <Target className="mx-auto mb-2 text-blue-600 dark:text-blue-400" size={28} />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Route Optimization</p>
              </div>
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 text-center">
                <Users className="mx-auto mb-2 text-green-600 dark:text-green-400" size={28} />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Fleet Management</p>
              </div>
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 text-center">
                <Zap className="mx-auto mb-2 text-purple-600 dark:text-purple-400" size={28} />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">AI-Powered Tools</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Our Story</h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Founded by a team passionate about logistics technology, Raute started from a simple observation:
              most delivery businesses still rely on spreadsheets, phone calls, and guesswork to manage their daily operations.
              We set out to change that by building a platform that&apos;s powerful enough for complex operations yet simple enough
              for anyone to use from day one.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Get in Touch</h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Have questions or want to learn more? We&apos;d love to hear from you.
              Reach out at <a href="mailto:support@raute.io" className="text-blue-600 hover:underline">support@raute.io</a> or
              visit our <Link href="/#contact" className="text-blue-600 hover:underline">contact page</Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
