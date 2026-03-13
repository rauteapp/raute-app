import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Acceptable Use Policy | Raute',
  description: 'Acceptable Use Policy for Raute.io by Howl Dating LLC. Understand prohibited activities, rate limits, fair use guidelines, and enforcement actions.',
}

export default function AcceptableUsePolicy() {
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
          Acceptable Use Policy
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 5.1 Purpose */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              5.1 Purpose
            </h2>
            <p>
              This Acceptable Use Policy (&quot;AUP&quot;) governs your use of
              the Raute.io platform and is incorporated by reference into our{' '}
              <Link
                href="/terms"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Terms of Service
              </Link>
              . By using the Service, you agree to comply with this AUP. This
              policy is designed to protect the integrity, security, and
              availability of the platform for all users.
            </p>
          </section>

          {/* 5.2 Prohibited Activities */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              5.2 Prohibited Activities
            </h2>
            <p className="mb-3">
              You agree not to use the Service to engage in any of the
              following prohibited activities:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Violating any applicable local, state, national, or
                international law or regulation.
              </li>
              <li>
                Uploading, transmitting, or storing data that is unlawful,
                defamatory, obscene, or otherwise objectionable.
              </li>
              <li>
                Conducting unauthorized security testing, penetration testing,
                or vulnerability scanning of the platform without prior written
                consent.
              </li>
              <li>
                Reverse engineering, decompiling, disassembling, or otherwise
                attempting to derive the source code of the Service.
              </li>
              <li>
                Scraping, crawling, or using automated tools to extract data
                from the platform without authorization.
              </li>
              <li>
                Reselling, sublicensing, or redistributing access to the
                Service without our written consent.
              </li>
              <li>
                Impersonating another person, entity, or user, or
                misrepresenting your affiliation with any person or entity.
              </li>
              <li>
                Disrupting, interfering with, or degrading the operation,
                performance, or availability of the Service or its
                infrastructure.
              </li>
              <li>
                Using the Service for competitive benchmarking, analysis, or
                intelligence gathering without prior written consent.
              </li>
            </ul>
          </section>

          {/* 5.3 Rate Limits & Fair Use */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              5.3 Rate Limits &amp; Fair Use
            </h2>
            <p className="mb-3">
              To ensure a consistent and reliable experience for all users, we
              maintain reasonable limits on platform usage, including:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>API request rate limits per account and per endpoint.</li>
              <li>
                File upload size and volume limits based on your subscription
                plan.
              </li>
              <li>
                Data storage limits appropriate to your subscription tier.
              </li>
            </ul>
            <p className="mt-3">
              If your usage approaches or exceeds these limits, we will notify
              you and provide information about available upgrade paths to
              accommodate your needs.
            </p>
          </section>

          {/* 5.4 Enforcement */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              5.4 Enforcement
            </h2>
            <p className="mb-3">
              Violations of this Acceptable Use Policy may result in the
              following actions, at our sole discretion:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Investigation:</strong> We may investigate any suspected
                violation, including reviewing account activity and data.
              </li>
              <li>
                <strong>Warnings:</strong> We may issue a formal warning and
                require corrective action within a specified timeframe.
              </li>
              <li>
                <strong>Suspension:</strong> We may temporarily suspend your
                account or access to specific features pending resolution.
              </li>
              <li>
                <strong>Termination:</strong> We may permanently terminate your
                account for serious or repeated violations.
              </li>
              <li>
                <strong>Law Enforcement:</strong> We may report illegal
                activities to the appropriate law enforcement authorities.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
