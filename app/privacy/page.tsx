import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy | Raute',
  description: 'Learn how Raute.io by Howl Dating LLC collects, uses, and protects your personal information. Covers data collection, GDPR rights, CCPA/CPRA compliance, data retention, and international transfers.',
}

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 2.1 Introduction */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.1 Introduction
            </h2>
            <p>
              Welcome to Raute.io (&quot;we,&quot; &quot;our,&quot; or
              &quot;us&quot;), operated by Howl Dating LLC. We are committed to
              protecting your personal information and your right to privacy.
              This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our route optimization and
              delivery management platform, available at{' '}
              <a
                href="https://raute.io"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                raute.io
              </a>{' '}
              and through our mobile applications.
            </p>
          </section>

          {/* 2.2 Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.2 Information We Collect
            </h2>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              A) Information You Provide Directly
            </h3>
            <ul className="list-disc list-inside space-y-2 mb-4 pl-2">
              <li>
                <strong>Account Data:</strong> Name, email address, phone
                number, company name, and role information provided during
                registration and account management.
              </li>
              <li>
                <strong>Payment Information:</strong> Billing details processed
                securely through Stripe. We do not store your full credit card
                numbers on our servers.
              </li>
              <li>
                <strong>Business Data:</strong> Driver information, delivery
                addresses, order details, route data, fleet information, and
                proof-of-delivery records (photos, signatures, notes) that you
                upload or create through the platform.
              </li>
              <li>
                <strong>Communications:</strong> Messages, support requests,
                feedback, and other correspondence you send to us.
              </li>
            </ul>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              B) Information Collected Automatically
            </h3>
            <ul className="list-disc list-inside space-y-2 mb-4 pl-2">
              <li>
                <strong>Device Information:</strong> Device type, operating
                system, browser type, app version, and unique device
                identifiers.
              </li>
              <li>
                <strong>Usage Data:</strong> Information about how you interact
                with our platform, including features used, pages visited,
                actions taken, and timestamps.
              </li>
              <li>
                <strong>Location Data:</strong> Real-time GPS location data is
                collected from driver accounts while the app is active to
                facilitate live delivery tracking, route optimization, and ETA
                calculations.
              </li>
              <li>
                <strong>Cookies &amp; Similar Technologies:</strong> We use
                cookies and similar tracking technologies to maintain sessions,
                remember preferences, and analyze usage patterns. See our{' '}
                <Link
                  href="/cookies"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Cookie Policy
                </Link>{' '}
                for details.
              </li>
            </ul>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              C) Information from Third Parties
            </h3>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Stripe:</strong> Payment confirmation and subscription
                status information.
              </li>
              <li>
                <strong>Analytics Providers:</strong> Aggregated usage and
                performance data.
              </li>
              <li>
                <strong>Mapping Services:</strong> Geocoding, routing, and
                address validation data.
              </li>
            </ul>
          </section>

          {/* 2.3 How We Use Your Information */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.3 How We Use Your Information
            </h2>
            <p className="mb-3">We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Provide, operate, and maintain the Raute.io platform and its
                features.
              </li>
              <li>
                Process transactions and manage your subscription billing.
              </li>
              <li>
                Communicate with you about your account, service updates, and
                support requests.
              </li>
              <li>
                Personalize your experience and improve the Service based on
                usage patterns.
              </li>
              <li>
                Protect the security and integrity of the platform and prevent
                fraud or unauthorized activity.
              </li>
              <li>Comply with legal obligations and enforce our Terms.</li>
              <li>
                Conduct analytics and research to improve our products and
                services.
              </li>
              <li>
                Send marketing communications (only with your consent, and you
                may opt out at any time).
              </li>
            </ul>
          </section>

          {/* 2.4 Legal Bases for Processing (GDPR) */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.4 Legal Bases for Processing (GDPR)
            </h2>
            <p className="mb-3">
              For users in the European Economic Area (EEA) and the United
              Kingdom, we process your personal data under the following legal
              bases:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Contract Performance:</strong> Processing necessary to
                fulfill our contractual obligations to you, including providing
                the Service.
              </li>
              <li>
                <strong>Legitimate Interests:</strong> Processing necessary for
                our legitimate business interests, such as improving the
                Service, ensuring security, and preventing fraud.
              </li>
              <li>
                <strong>Consent:</strong> Where you have given explicit consent
                for specific processing activities, such as marketing
                communications.
              </li>
              <li>
                <strong>Legal Obligations:</strong> Processing necessary to
                comply with applicable laws and regulations.
              </li>
            </ul>
          </section>

          {/* 2.5 How We Share */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.5 How We Share Your Information
            </h2>
            <p className="mb-3">
              We do not sell your personal data. We may share your information
              in the following limited circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Service Providers:</strong> With third-party vendors
                that perform services on our behalf, such as payment processing
                (Stripe), cloud hosting, mapping services, email delivery, and
                analytics providers. These providers are contractually obligated
                to protect your data.
              </li>
              <li>
                <strong>Legal Requirements:</strong> When required by law,
                regulation, legal process, or governmental request.
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a
                merger, acquisition, reorganization, or sale of assets, your
                information may be transferred as part of the transaction.
              </li>
              <li>
                <strong>With Your Consent:</strong> When you have given us
                explicit permission to share your information for a specific
                purpose.
              </li>
            </ul>
          </section>

          {/* 2.6 Data Retention */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.6 Data Retention
            </h2>
            <p>
              We retain your personal information for as long as your account is
              active or as needed to provide the Service. Upon account
              termination or deletion, we will remove your personal data within
              30 calendar days, except where retention is required by law or for
              legitimate business purposes. Anonymized and aggregated data that
              cannot be used to identify you may be retained indefinitely for
              analytics and service improvement purposes.
            </p>
          </section>

          {/* 2.7 Data Security */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.7 Data Security
            </h2>
            <p className="mb-3">
              We implement industry-standard technical and organizational
              security measures to protect your personal information,
              including:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>TLS/SSL encryption for all data in transit.</li>
              <li>Encryption at rest for stored data.</li>
              <li>
                Role-based access controls to limit data access to authorized
                personnel.
              </li>
              <li>Regular security audits and assessments.</li>
            </ul>
            <p className="mt-3">
              However, no method of transmission over the internet or electronic
              storage is 100% secure, and we cannot guarantee absolute security
              of your data.
            </p>
          </section>

          {/* 2.8 Your Rights */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.8 Your Rights
            </h2>
            <p className="mb-3">
              Depending on your jurisdiction, you may have the following rights
              regarding your personal data:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Access:</strong> Request a copy of the personal data we
                hold about you.
              </li>
              <li>
                <strong>Correction:</strong> Request correction of inaccurate or
                incomplete personal data.
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your personal
                data.
              </li>
              <li>
                <strong>Portability:</strong> Request a copy of your data in a
                structured, commonly used, machine-readable format.
              </li>
              <li>
                <strong>Opt-Out:</strong> Opt out of marketing communications
                and non-essential data processing.
              </li>
              <li>
                <strong>Restriction:</strong> Request restriction of processing
                of your personal data under certain conditions.
              </li>
              <li>
                <strong>Objection:</strong> Object to processing of your
                personal data based on legitimate interests.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, you may use our self-service
              privacy portal at{' '}
              <a
                href="https://raute.io/privacy-requests"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                raute.io/privacy-requests
              </a>{' '}
              or email us at{' '}
              <a
                href="mailto:support@raute.io"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@raute.io
              </a>
              . We will acknowledge your request within 5 business days and
              fulfill it within 30 calendar days.
            </p>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2 mt-4">
              California Residents (CCPA/CPRA)
            </h3>
            <p>
              If you are a California resident, you have additional rights under
              the California Consumer Privacy Act (CCPA) and the California
              Privacy Rights Act (CPRA), including the right to know what
              personal information we collect, the right to delete your personal
              information, the right to opt out of the sale or sharing of your
              personal information (we do not sell your data), and the right to
              non-discrimination for exercising your privacy rights.
            </p>
          </section>

          {/* 2.9 International Data Transfers */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.9 International Data Transfers
            </h2>
            <p>
              Your information is processed and stored in the United States. If
              you are located outside the United States, please be aware that
              your data will be transferred to, stored, and processed in the
              United States. Where required by applicable law, we use Standard
              Contractual Clauses (SCCs) approved by the European Commission or
              other legally approved transfer mechanisms to ensure adequate
              protection of your personal data during international transfers.
            </p>
          </section>

          {/* 2.10 Children's Privacy */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.10 Children&apos;s Privacy
            </h2>
            <p>
              The Service is not intended for use by individuals under the age
              of 18. We do not knowingly collect personal information from
              children under 18. If we become aware that we have collected
              personal data from a child under 18, we will take prompt steps to
              delete that information.
            </p>
          </section>

          {/* 2.11 Changes to This Policy */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.11 Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time to reflect
              changes in our practices, technologies, legal requirements, or
              other factors. We will notify you of any material changes by
              posting the updated policy on our platform and updating the
              &quot;Last updated&quot; date. Your continued use of the Service
              after changes are posted constitutes acceptance of the updated
              Privacy Policy.
            </p>
          </section>

          {/* 2.12 Contact */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2.12 Contact
            </h2>
            <p>
              If you have any questions or concerns about this Privacy Policy or
              our data practices, please contact us:
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
