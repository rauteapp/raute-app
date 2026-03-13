import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Promotional Terms | Raute',
  description: 'Promotional terms for Raute.io by Howl Dating LLC. Learn about free trial terms, promotional codes, referral programs, and related conditions.',
}

export default function PromotionalTerms() {
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
          Promotional Terms
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 7.1 General */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              7.1 General
            </h2>
            <p>
              From time to time, Raute.io may offer promotions, discounts, free
              trials, or other special offers. These promotions may be subject
              to additional terms and conditions specific to each offer, which
              will be communicated at the time of the promotion. In the event
              of a conflict between promotional terms and our general{' '}
              <Link
                href="/terms"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Terms of Service
              </Link>
              , the promotional terms will take precedence for the duration of
              the promotion.
            </p>
          </section>

          {/* 7.2 Free Trials */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              7.2 Free Trials
            </h2>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Free trials may provide full or limited access to the Service
                for a specified period.
              </li>
              <li>
                At the end of the trial period, your account will
                automatically convert to a paid subscription at the then-current
                rate unless you cancel before the trial ends.
              </li>
              <li>
                We will send a reminder notification at least 3 days before
                your trial expires and billing begins.
              </li>
              <li>
                Free trials are limited to one per customer. Creating multiple
                accounts to take advantage of additional trials is prohibited.
              </li>
            </ul>
          </section>

          {/* 7.3 Promotional Codes */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              7.3 Promotional Codes
            </h2>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Promotional codes must be applied at the time of purchase or
                subscription signup. Codes cannot be applied retroactively.
              </li>
              <li>
                Promotional codes are non-transferable and have no cash value.
              </li>
              <li>
                We reserve the right to revoke, modify, or cancel any
                promotional code at any time without notice.
              </li>
              <li>
                Only one promotional code may be used per transaction unless
                otherwise stated.
              </li>
            </ul>
          </section>

          {/* 7.4 Referral Programs */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              7.4 Referral Programs
            </h2>
            <p>
              Referral programs, when offered, will have specific terms and
              conditions communicated at the time of program launch. Referral
              rewards are subject to verification and may be withheld or
              revoked if the referral is found to be fraudulent, self-referral,
              or otherwise in violation of the program terms. We reserve the
              right to modify or discontinue referral programs at any time.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
