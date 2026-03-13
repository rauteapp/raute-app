import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Contact | Raute',
  description: 'Contact Raute.io by Howl Dating LLC. Find our email, contact form, business information, response times, and escalation procedures.',
}

export default function Contact() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-6 py-12 safe-area-p">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        {/* Header */}
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Contact
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 6.1 How to Reach Us */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              6.1 How to Reach Us
            </h2>
            <p className="mb-3">
              You can contact our support team through any of the following
              channels:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:support@raute.io"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  support@raute.io
                </a>
              </li>
              <li>
                <strong>Contact Form:</strong>{' '}
                <a
                  href="https://raute.io/contact"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  raute.io/contact
                </a>
              </li>
              <li>
                <strong>In-App Support:</strong> Use the help or chat feature
                available within the Raute.io platform for real-time assistance.
              </li>
            </ul>
          </section>

          {/* 6.2 Business Information */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              6.2 Business Information
            </h2>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <p className="font-medium text-slate-900 dark:text-white">
                Howl Dating LLC
              </p>
              <p>DBA Raute.io</p>
              <p>State of California, United States</p>
              <p className="mt-2">
                Website:{' '}
                <a
                  href="https://raute.io"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  raute.io
                </a>
              </p>
            </div>
          </section>

          {/* 6.3 Response Times */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              6.3 Response Times
            </h2>
            <p>
              We strive to respond to all inquiries within 1 business day.
              Complex issues that require additional investigation or
              coordination may take longer to fully resolve, and we will keep
              you informed of our progress.
            </p>
          </section>

          {/* 6.4 Escalation */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              6.4 Escalation
            </h2>
            <p>
              If you are not satisfied with the initial response to your
              inquiry, you may request an escalation by replying to the support
              thread with &quot;Escalation Requested&quot; in the subject line
              or message body. Escalated requests will be reviewed by a senior
              team member within 2 business days.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
