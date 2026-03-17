import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Careers | Raute',
  description: 'Join the Raute team and help build the future of last-mile delivery.',
}

export default function CareersPage() {
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
          Careers at Raute
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mb-10">
          Help us build the future of last-mile delivery.
        </p>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Why Raute?</h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              We&apos;re a fast-growing team solving real problems in logistics. At Raute, you&apos;ll work on
              cutting-edge AI, real-time systems, and mobile apps that directly impact how businesses
              deliver to their customers every day.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Open Positions</h2>
            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800">
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                We don&apos;t have any open positions right now, but we&apos;re always looking for talented people.
              </p>
              <a
                href="mailto:careers@raute.io"
                className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                <Mail size={18} />
                Send us your resume at careers@raute.io
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
