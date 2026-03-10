import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy | Raute',
  description: 'Learn how Raute collects, uses, and protects your personal information. Our privacy policy covers data collection, location tracking, push notifications, and your rights.',
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
          Last updated: March 7, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 1. Introduction */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1. Introduction
            </h2>
            <p>
              Welcome to Raute (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We operate the
              Raute delivery management platform available at{' '}
              <a href="https://raute.io" className="text-blue-600 dark:text-blue-400 hover:underline">
                raute.io
              </a>{' '}
              and through our mobile applications. We are committed to protecting
              your personal information and your right to privacy. This Privacy
              Policy explains how we collect, use, disclose, and safeguard your
              information when you use our services.
            </p>
          </section>

          {/* 2. Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2. Information We Collect
            </h2>
            <p className="mb-4">
              We collect information that you provide directly and information
              collected automatically when you use our platform:
            </p>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              Information You Provide
            </h3>
            <ul className="list-disc list-inside space-y-2 mb-4 pl-2">
              <li>
                <strong>Account Information:</strong> Name, email address, phone
                number, and company details required for account creation and
                management.
              </li>
              <li>
                <strong>Driver Data:</strong> Names, vehicle types, and contact
                information of drivers added to your fleet.
              </li>
              <li>
                <strong>Order Data:</strong> Customer names, addresses, delivery
                details, and notes uploaded for route planning and delivery
                management.
              </li>
              <li>
                <strong>Proof of Delivery:</strong> Photos, signatures, and
                delivery notes captured by drivers upon completion of deliveries.
              </li>
              <li>
                <strong>Communications:</strong> Messages, support requests, and
                feedback you send to us.
              </li>
            </ul>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              Information Collected Automatically
            </h3>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Location Data:</strong> Real-time GPS location data is
                collected from driver accounts while the app is active to
                facilitate live delivery tracking, route optimization, and ETA
                calculations. Location data is only collected when a driver is
                actively on duty.
              </li>
              <li>
                <strong>Device Information:</strong> Device type, operating
                system, app version, and unique device identifiers used for push
                notification delivery and troubleshooting.
              </li>
              <li>
                <strong>Usage Data:</strong> Information about how you interact
                with our platform, including features used and pages visited.
              </li>
            </ul>
          </section>

          {/* 3. How We Use Your Information */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              3. How We Use Your Information
            </h2>
            <p className="mb-3">We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>Provide, operate, and maintain the Raute platform.</li>
              <li>
                Calculate and optimize delivery routes for your fleet.
              </li>
              <li>
                Enable real-time delivery tracking and estimated time of arrival
                notifications.
              </li>
              <li>
                Send push notifications for delivery status updates, driver
                alerts, and order assignments.
              </li>
              <li>
                Send email communications for account verification, password
                resets, delivery confirmations, and service updates.
              </li>
              <li>Process payments and manage subscriptions.</li>
              <li>
                Improve our services, develop new features, and analyze usage
                patterns.
              </li>
              <li>
                Respond to support requests and communicate with you about your
                account.
              </li>
              <li>
                Enforce our terms and protect against fraud or unauthorized
                activity.
              </li>
            </ul>
          </section>

          {/* 4. Data Sharing */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              4. Data Sharing and Disclosure
            </h2>
            <p className="mb-3">
              We do not sell your personal data. We may share your information
              in the following limited circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Service Providers:</strong> We share data with
                third-party vendors that perform services on our behalf, such as
                payment processors (Stripe, Apple), mapping services, cloud
                hosting (Supabase), and email delivery services.
              </li>
              <li>
                <strong>Delivery Tracking:</strong> Limited delivery information
                (driver location, ETA, delivery status) may be shared with end
                customers via tracking links that you generate through the
                platform.
              </li>
              <li>
                <strong>Legal Requirements:</strong> We may disclose your
                information if required by law, regulation, legal process, or
                governmental request.
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a
                merger, acquisition, or sale of assets, your information may be
                transferred as part of the transaction.
              </li>
            </ul>
          </section>

          {/* 5. Data Security */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              5. Data Security
            </h2>
            <p>
              We implement appropriate technical and organizational security
              measures to protect your personal information. These include
              encryption of data in transit and at rest, secure authentication
              mechanisms, access controls, and regular security assessments.
              However, no method of transmission over the internet or electronic
              storage is completely secure, and we cannot guarantee absolute
              security.
            </p>
          </section>

          {/* 6. Cookies and Tracking */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              6. Cookies and Tracking Technologies
            </h2>
            <p>
              Our web application uses cookies and similar technologies to
              maintain your session, remember your preferences, and improve your
              experience. We use essential cookies required for the platform to
              function (such as authentication tokens) and analytics cookies to
              understand usage patterns. You can control cookie preferences
              through your browser settings, though disabling essential cookies
              may affect platform functionality.
            </p>
          </section>

          {/* 7. Push Notifications */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              7. Push Notifications
            </h2>
            <p>
              We use push notifications to deliver time-sensitive information
              such as new order assignments, delivery status updates, and
              important alerts. You can manage your push notification preferences
              in the app settings or through your device settings at any time.
              Disabling push notifications will not affect the core functionality
              of the platform, but you may miss important real-time updates.
            </p>
          </section>

          {/* 8. Data Retention and Deletion */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              8. Data Retention and Deletion
            </h2>
            <p>
              We retain your information for as long as your account is active or
              as needed to provide our services. You may request the deletion of
              your account and all associated data at any time by using the
              &quot;Delete Account&quot; option in the application settings or by
              contacting us at{' '}
              <a
                href="mailto:support@raute.io"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@raute.io
              </a>
              . Upon account deletion, we will remove your personal data within
              30 days, except where retention is required by law.
            </p>
          </section>

          {/* 9. Your Rights */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              9. Your Rights
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
                incomplete data.
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your personal
                data.
              </li>
              <li>
                <strong>Portability:</strong> Request a copy of your data in a
                structured, machine-readable format.
              </li>
              <li>
                <strong>Opt-Out:</strong> Opt out of marketing communications
                and non-essential push notifications.
              </li>
              <li>
                <strong>Restriction:</strong> Request restriction of processing
                of your personal data under certain conditions.
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us at{' '}
              <a
                href="mailto:support@raute.io"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@raute.io
              </a>
              .
            </p>
          </section>

          {/* 10. Children's Privacy */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              10. Children&apos;s Privacy
            </h2>
            <p>
              Our platform is not intended for use by individuals under the age
              of 18. We do not knowingly collect personal information from
              children. If we become aware that we have collected data from a
              child, we will take steps to delete that information promptly.
            </p>
          </section>

          {/* 11. Changes to This Policy */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              11. Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify
              you of any material changes by posting the updated policy on our
              platform and updating the &quot;Last updated&quot; date. Your
              continued use of Raute after changes are posted constitutes
              acceptance of the updated policy.
            </p>
          </section>

          {/* 12. Contact Us */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              12. Contact Us
            </h2>
            <p>
              If you have any questions or concerns about this Privacy Policy or
              our data practices, please contact us:
            </p>
            <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <p className="font-medium text-slate-900 dark:text-white">Raute</p>
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
