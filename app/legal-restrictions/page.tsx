import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Legal & Export Restrictions | Raute',
  description: 'Legal and export restrictions for Raute.io by Howl Dating LLC. Learn about compliance with US export controls, OFAC sanctions, and geographic availability.',
}

export default function LegalRestrictions() {
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
          Legal &amp; Export Restrictions
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 8.1 Compliance with Laws */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              8.1 Compliance with Laws
            </h2>
            <p>
              By using the Raute.io platform, you agree to comply with all
              applicable laws and regulations, including but not limited to
              United States export control laws, trade sanctions administered
              by the Office of Foreign Assets Control (OFAC), and any other
              applicable international trade compliance requirements.
            </p>
          </section>

          {/* 8.2 Export Controls */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              8.2 Export Controls
            </h2>
            <p>
              The Service and any related technology are subject to the Export
              Administration Regulations (EAR) administered by the U.S.
              Department of Commerce, Bureau of Industry and Security. You
              agree not to export, re-export, or transfer the Service or any
              related technical data, directly or indirectly, to any country,
              entity, or person prohibited by applicable export control laws
              without first obtaining all required government authorizations.
            </p>
          </section>

          {/* 8.3 Sanctions */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              8.3 Sanctions
            </h2>
            <p className="mb-3">
              By using the Service, you represent and warrant that:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                You are not located in, organized under the laws of, or a
                resident of any country or territory that is subject to
                comprehensive U.S. sanctions, including Cuba, Iran, North
                Korea, Syria, and the Crimea, Donetsk, and Luhansk regions.
              </li>
              <li>
                You are not listed on, or owned or controlled by any party
                listed on, the U.S. Treasury Department&apos;s Specially
                Designated Nationals and Blocked Persons List (SDN List) or any
                other applicable restricted party list.
              </li>
              <li>
                You will not use the Service in any manner that would cause
                Howl Dating LLC to violate any applicable sanctions laws or
                regulations.
              </li>
            </ul>
          </section>

          {/* 8.4 Geographic Availability */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              8.4 Geographic Availability
            </h2>
            <p>
              The Raute.io platform is primarily designed for and offered to
              users within the United States. Users accessing the Service from
              other jurisdictions do so at their own initiative and are solely
              responsible for compliance with all applicable local laws and
              regulations. We make no representation that the Service is
              appropriate or available for use in any particular jurisdiction
              outside of the United States.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
