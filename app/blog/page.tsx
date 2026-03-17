import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Bell } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Blog | Raute',
  description: 'Latest news, updates, and insights from the Raute team on last-mile delivery and fleet management.',
}

export default function BlogPage() {
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
          Raute Blog
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mb-10">
          News, updates, and insights on last-mile delivery.
        </p>

        <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800">
          <Bell className="mx-auto mb-4 text-blue-600 dark:text-blue-400" size={32} />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Coming Soon</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            We&apos;re working on our first posts. Stay tuned for articles on route optimization,
            fleet management tips, and product updates.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Follow us on social media or <a href="mailto:support@raute.io" className="text-blue-600 hover:underline">subscribe to updates</a> to be notified.
          </p>
        </div>
      </div>
    </div>
  )
}
