import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Refund & Dispute Policy | Raute',
  description: 'Refund and dispute resolution policy for Raute.io by Howl Dating LLC. Learn about refund eligibility, processing timelines, and how to resolve billing disputes.',
}

export default function RefundPolicy() {
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
          Refund &amp; Dispute Policy
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 3.1 Overview */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              3.1 Overview
            </h2>
            <p>
              Raute.io is a digital Software-as-a-Service (SaaS) platform. We
              do not sell or ship physical goods. This Refund &amp; Dispute
              Policy outlines the circumstances under which refunds may be
              issued and how billing disputes are handled.
            </p>
          </section>

          {/* 3.2 Eligibility for Refunds */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              3.2 Eligibility for Refunds
            </h2>
            <p className="mb-3">
              Refunds may be issued in the following circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Billing Errors:</strong> If you were charged
                incorrectly due to a system error, you are entitled to a full
                refund of the erroneous charge.
              </li>
              <li>
                <strong>Service Outage:</strong> If the Service experiences a
                continuous outage exceeding 72 hours, you may be eligible for a
                pro-rated refund or service credit for the affected period.
              </li>
              <li>
                <strong>Duplicate Charges:</strong> If you were charged more
                than once for the same subscription period, the duplicate
                charge will be fully refunded.
              </li>
              <li>
                <strong>Trial Inadvertent Charges:</strong> If you were
                inadvertently charged during or immediately following a free
                trial period due to a platform error, the charge will be
                refunded.
              </li>
            </ul>
          </section>

          {/* 3.3 Non-Refundable */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              3.3 Non-Refundable Items
            </h2>
            <p className="mb-3">
              The following are not eligible for refunds:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Subscription periods that have already been used or partially
                consumed.
              </li>
              <li>
                Setup fees, onboarding fees, or professional services fees.
              </li>
              <li>
                Charges that are more than 60 days old at the time of the
                refund request.
              </li>
              <li>
                Third-party add-ons, integrations, or services purchased
                through external providers.
              </li>
            </ul>
          </section>

          {/* 3.4 How to Request */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              3.4 How to Request a Refund
            </h2>
            <p className="mb-3">
              To request a refund, please email{' '}
              <a
                href="mailto:support@raute.io"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@raute.io
              </a>{' '}
              with the following information:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>The email address associated with your account.</li>
              <li>The date and amount of the charge in question.</li>
              <li>The reason for your refund request.</li>
              <li>
                Any supporting documentation (e.g., screenshots, billing
                statements).
              </li>
            </ul>
          </section>

          {/* 3.5 Processing Timeline */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              3.5 Processing Timeline
            </h2>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                We will acknowledge your refund request within 2 business days.
              </li>
              <li>
                Refund requests will be reviewed and resolved within 10
                business days of acknowledgment.
              </li>
              <li>
                Approved refunds will be issued to your original payment
                method. Processing times may vary depending on your financial
                institution.
              </li>
            </ul>
          </section>

          {/* 3.6 Dispute Resolution */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              3.6 Dispute Resolution
            </h2>
            <p className="mb-3">
              If you have a billing dispute, we encourage you to contact us
              directly before initiating a dispute with your payment provider.
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Email{' '}
                <a
                  href="mailto:support@raute.io"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  support@raute.io
                </a>{' '}
                with details of the dispute.
              </li>
              <li>
                We will work to resolve the issue within 15 business days.
              </li>
              <li>
                If we are unable to resolve the dispute to your satisfaction,
                you may escalate the matter through your payment provider.
              </li>
            </ul>
          </section>

          {/* 3.7 Chargebacks */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              3.7 Chargebacks
            </h2>
            <p className="mb-3">
              We reserve the right to recover any disputed amounts plus
              associated fees if a chargeback is filed without first attempting
              to resolve the issue directly with us.
            </p>
            <p>
              Repeated or fraudulent chargebacks may result in permanent
              termination of your account and prohibition from future use of
              the Service.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
