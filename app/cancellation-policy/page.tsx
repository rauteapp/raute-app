import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Cancellation Policy | Raute',
  description: 'Cancellation policy for Raute.io by Howl Dating LLC. Learn how to cancel your subscription, what happens after cancellation, and data retention details.',
}

export default function CancellationPolicy() {
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
          Cancellation Policy
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 4.1 How to Cancel */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              4.1 How to Cancel
            </h2>
            <p className="mb-3">
              You may cancel your Raute.io subscription at any time using one of
              the following methods:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Self-Service:</strong> Navigate to Settings &gt;
                Subscription in your account dashboard and follow the
                cancellation steps.
              </li>
              <li>
                <strong>Email:</strong> Send a cancellation request to{' '}
                <a
                  href="mailto:support@raute.io"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  support@raute.io
                </a>{' '}
                from the email address associated with your account.
              </li>
              <li>
                <strong>Contact Form:</strong> Submit a cancellation request
                through our contact form on the website.
              </li>
            </ul>
          </section>

          {/* 4.2 Effect of Cancellation */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              4.2 Effect of Cancellation
            </h2>
            <p className="mb-3">
              Upon cancellation of your subscription:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Your subscription will remain active until the end of your
                current billing period.
              </li>
              <li>
                No further charges will be applied after the current billing
                period ends.
              </li>
              <li>
                Your account data will be retained for 30 days following the
                end of your subscription to allow for reactivation or data
                export.
              </li>
              <li>
                You may export your data at any time before and during the
                30-day retention period.
              </li>
            </ul>
          </section>

          {/* 4.3 Annual Subscriptions */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              4.3 Annual Subscriptions
            </h2>
            <p className="mb-3">
              For annual subscription plans:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Cancellation takes effect at the end of the current annual
                billing period.
              </li>
              <li>
                No pro-rated refunds are provided for the remainder of the
                annual term.
              </li>
              <li>
                At our discretion, we may consider refund requests submitted
                within 14 days of the initial annual subscription purchase.
              </li>
            </ul>
          </section>

          {/* 4.4 Downgrade */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              4.4 Downgrading Your Plan
            </h2>
            <p>
              If you choose to downgrade to a lower-tier subscription plan, the
              change will take effect at the beginning of your next billing
              cycle. No refund or credit is issued for the remaining time on
              your current billing period. Features exclusive to your current
              plan may become unavailable upon the downgrade taking effect.
            </p>
          </section>

          {/* 4.5 Termination by Us */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              4.5 Termination by Us
            </h2>
            <p className="mb-3">
              We reserve the right to suspend or terminate your account under
              the following circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Violations:</strong> Breach of our Terms of Service,
                Acceptable Use Policy, or any other applicable agreement.
              </li>
              <li>
                <strong>Failed Payment:</strong> Non-payment after a 7-day
                grace period following a failed billing attempt.
              </li>
              <li>
                <strong>Legal Requirement:</strong> When required by applicable
                law, regulation, or legal process.
              </li>
              <li>
                <strong>Security Risk:</strong> If your account poses a
                security risk to the platform, other users, or our
                infrastructure.
              </li>
            </ul>
          </section>

          {/* 4.6 Post-Termination */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              4.6 Post-Termination
            </h2>
            <p>
              Upon termination of your account, whether by you or by us, all
              licenses granted to you under the Terms of Service will
              immediately cease. Sections of the Terms that by their nature
              should survive termination (including but not limited to
              intellectual property, limitation of liability, indemnification,
              and governing law provisions) will continue in full force and
              effect.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
