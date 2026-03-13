import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Data Processing Addendum | Raute',
  description: 'Data Processing Addendum (DPA) for Raute.io by Howl Dating LLC. Covers GDPR and CCPA/CPRA compliance, sub-processors, international transfers, and data subject rights.',
}

export default function DataProcessingAddendum() {
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
          Data Processing Addendum
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 10.1 Scope */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              10.1 Scope
            </h2>
            <p>
              This Data Processing Addendum (&quot;DPA&quot;) supplements the{' '}
              <Link
                href="/terms"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Privacy Policy
              </Link>{' '}
              and applies when Howl Dating LLC, doing business as Raute.io,
              processes personal data on behalf of its customers
              (&quot;Controller&quot;) in connection with the provision of the
              Service. This DPA sets forth the obligations of the parties with
              respect to the processing and security of personal data.
            </p>
          </section>

          {/* 10.2 Definitions */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              10.2 Definitions
            </h2>
            <p className="mb-3">
              Unless otherwise defined herein, terms used in this DPA shall
              have the meanings given to them in the applicable data protection
              legislation, including:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>GDPR:</strong> Regulation (EU) 2016/679 (General Data
                Protection Regulation) and its national implementing
                legislation.
              </li>
              <li>
                <strong>CCPA/CPRA:</strong> The California Consumer Privacy Act
                of 2018, as amended by the California Privacy Rights Act of
                2020.
              </li>
              <li>
                <strong>Controller:</strong> The entity that determines the
                purposes and means of the processing of personal data (the
                customer).
              </li>
              <li>
                <strong>Processor:</strong> The entity that processes personal
                data on behalf of the Controller (Howl Dating LLC / Raute.io).
              </li>
              <li>
                <strong>Data Subject:</strong> An identified or identifiable
                natural person whose personal data is processed.
              </li>
              <li>
                <strong>Personal Data:</strong> Any information relating to a
                Data Subject, as defined under applicable data protection law.
              </li>
              <li>
                <strong>Sub-Processor:</strong> Any third party engaged by the
                Processor to process personal data on behalf of the
                Controller.
              </li>
            </ul>
          </section>

          {/* 10.3 Our Obligations */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              10.3 Our Obligations as Processor
            </h2>
            <p className="mb-3">
              As a data processor, Howl Dating LLC commits to the following
              obligations:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Documented Instructions:</strong> Process personal data
                only in accordance with the documented instructions of the
                Controller, unless required by applicable law.
              </li>
              <li>
                <strong>Confidentiality:</strong> Ensure that all personnel
                authorized to process personal data are bound by appropriate
                confidentiality obligations.
              </li>
              <li>
                <strong>Security Measures:</strong> Implement and maintain
                appropriate technical and organizational security measures to
                protect personal data against unauthorized or unlawful
                processing and against accidental loss, destruction, or damage.
              </li>
              <li>
                <strong>Data Subject Requests:</strong> Assist the Controller
                in fulfilling its obligations to respond to Data Subject
                requests to exercise their rights under applicable data
                protection law.
              </li>
              <li>
                <strong>Breach Notification:</strong> Notify the Controller
                without undue delay, and in any event within 72 hours, upon
                becoming aware of a personal data breach.
              </li>
              <li>
                <strong>Deletion or Return:</strong> Upon termination of the
                Service or at the Controller&apos;s request, delete or return
                all personal data to the Controller, unless retention is
                required by applicable law.
              </li>
              <li>
                <strong>Audits:</strong> Make available to the Controller all
                information necessary to demonstrate compliance with this DPA
                and allow for and contribute to audits conducted by the
                Controller or an authorized auditor.
              </li>
            </ul>
          </section>

          {/* 10.4 Sub-Processors */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              10.4 Sub-Processors
            </h2>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                We may engage Sub-Processors to assist in providing the
                Service, subject to appropriate data processing agreements.
              </li>
              <li>
                We maintain a current list of Sub-Processors and will make it
                available upon request.
              </li>
              <li>
                We will notify the Controller of any intended changes to
                Sub-Processors, providing the Controller with an opportunity to
                object to such changes.
              </li>
              <li>
                We remain fully liable for the acts and omissions of our
                Sub-Processors with respect to the processing of personal data.
              </li>
            </ul>
          </section>

          {/* 10.5 International Transfers */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              10.5 International Transfers
            </h2>
            <p>
              Where personal data is transferred to countries outside the
              European Economic Area (EEA) or other jurisdictions with data
              transfer restrictions, we will ensure that appropriate safeguards
              are in place. This includes the use of Standard Contractual
              Clauses (SCCs) approved by the European Commission or other
              legally approved transfer mechanisms to ensure adequate
              protection of personal data during international transfers.
            </p>
          </section>

          {/* 10.6 Contact */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              10.6 Contact
            </h2>
            <p>
              For questions or requests related to this Data Processing
              Addendum, please contact us:
            </p>
            <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <p className="font-medium text-slate-900 dark:text-white">Howl Dating LLC, DBA Raute.io</p>
              <p>
                Email:{' '}
                <a
                  href="mailto:support@raute.io"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  support@raute.io
                </a>
              </p>
              <p>
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
        </div>
      </div>
    </div>
  )
}
