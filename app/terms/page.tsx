import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Service | Raute',
  description: 'Terms of Service for Raute, the delivery management platform. Read about user responsibilities, acceptable use, service availability, and more.',
}

export default function TermsOfService() {
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
          Terms of Service
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 7, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 1. Agreement to Terms */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1. Agreement to Terms
            </h2>
            <p>
              By accessing or using the Raute delivery management platform
              (&quot;Service&quot;), available at{' '}
              <a href="https://raute.io" className="text-blue-600 dark:text-blue-400 hover:underline">
                raute.io
              </a>{' '}
              and through our mobile applications, you agree to be bound by
              these Terms of Service (&quot;Terms&quot;). If you disagree with
              any part of these Terms, you may not access the Service. These
              Terms apply to all users, including dispatchers, drivers, and
              administrators.
            </p>
          </section>

          {/* 2. Description of Service */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              2. Description of Service
            </h2>
            <p>
              Raute is a delivery management platform that provides route
              optimization, fleet management, real-time delivery tracking, driver
              management, and order dispatch tools. The Service is designed for
              businesses that manage delivery operations and includes web-based
              dashboards and mobile applications for drivers and dispatchers.
            </p>
          </section>

          {/* 3. Account Registration */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              3. Account Registration
            </h2>
            <p>
              To use the Service, you must create an account by providing
              accurate and complete information. You are responsible for
              maintaining the confidentiality of your account credentials and for
              all activities that occur under your account. You agree to notify
              us immediately of any unauthorized use of your account. Raute
              reserves the right to suspend or terminate accounts that contain
              inaccurate information or violate these Terms.
            </p>
          </section>

          {/* 4. Subscriptions and Payments */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              4. Subscriptions and Payments
            </h2>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Pricing:</strong> Raute is a subscription-based service.
                Current pricing is available on our website and within the
                application.
              </li>
              <li>
                <strong>Billing:</strong> Payments are processed via the Apple
                App Store (iOS) or Stripe (Web). Subscriptions auto-renew unless
                canceled at least 24 hours before the end of the current billing
                period.
              </li>
              <li>
                <strong>Cancellations:</strong> You can manage or cancel your
                subscription through your device settings (iOS) or through your
                account profile on the web.
              </li>
              <li>
                <strong>Refunds:</strong> Refund policies are governed by the
                respective payment platform (Apple App Store or Stripe). Contact
                us at{' '}
                <a
                  href="mailto:support@raute.io"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  support@raute.io
                </a>{' '}
                for billing inquiries.
              </li>
            </ul>
          </section>

          {/* 5. User Responsibilities */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              5. User Responsibilities
            </h2>
            <p className="mb-3">As a user of Raute, you agree to:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Provide accurate and up-to-date information for your account,
                drivers, and delivery orders.
              </li>
              <li>
                Ensure that all drivers using the platform hold valid driver&apos;s
                licenses and comply with applicable traffic laws.
              </li>
              <li>
                Use the Service only for lawful purposes and in accordance with
                these Terms.
              </li>
              <li>
                Maintain appropriate insurance coverage for your delivery
                operations.
              </li>
              <li>
                Protect the confidentiality of your account credentials and not
                share them with unauthorized individuals.
              </li>
              <li>
                Notify us promptly of any security breach or unauthorized use of
                your account.
              </li>
            </ul>
          </section>

          {/* 6. Acceptable Use */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              6. Acceptable Use
            </h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Use the Service for any illegal, fraudulent, or unauthorized
                purpose.
              </li>
              <li>
                Attempt to gain unauthorized access to the Service, other
                accounts, or our systems.
              </li>
              <li>
                Interfere with or disrupt the operation of the Service or its
                infrastructure.
              </li>
              <li>
                Reverse engineer, decompile, or attempt to extract the source
                code of the Service.
              </li>
              <li>
                Upload malicious code, viruses, or any harmful content to the
                platform.
              </li>
              <li>
                Use automated tools (bots, scrapers) to access the Service
                without our written consent.
              </li>
              <li>
                Resell, redistribute, or sublicense access to the Service
                without authorization.
              </li>
              <li>
                Use the platform to transport illegal goods or engage in
                prohibited delivery activities.
              </li>
            </ul>
          </section>

          {/* 7. Driver Safety */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              7. Driver Safety
            </h2>
            <p>
              Raute provides route optimization and navigation suggestions but
              does not guarantee road safety or real-time traffic accuracy. All
              drivers must obey applicable traffic laws, exercise their own
              judgment, and prioritize safety at all times. Raute is not liable
              for accidents, traffic violations, penalties, or any damages
              incurred while using the application for navigation or delivery
              purposes.
            </p>
          </section>

          {/* 8. Service Availability */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              8. Service Availability
            </h2>
            <p>
              We strive to maintain high availability of the Service, but we do
              not guarantee uninterrupted, error-free, or secure access at all
              times. The Service may be temporarily unavailable due to scheduled
              maintenance, updates, or circumstances beyond our control
              (including but not limited to internet outages, server failures, or
              force majeure events). We will make reasonable efforts to notify
              users of planned downtime in advance. We are not liable for any
              losses or damages resulting from Service unavailability.
            </p>
          </section>

          {/* 9. Intellectual Property */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              9. Intellectual Property
            </h2>
            <p>
              The Service, including all content, features, software, and
              branding, is owned by Raute and protected by intellectual property
              laws. You retain ownership of the data you upload to the platform
              (such as order data and delivery records). By using the Service,
              you grant Raute a limited license to use your data solely for the
              purpose of providing and improving the Service.
            </p>
          </section>

          {/* 10. Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              10. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by applicable law, Raute and its
              officers, directors, employees, and agents shall not be liable for
              any indirect, incidental, special, consequential, or punitive
              damages, including but not limited to loss of profits, data, or
              business opportunities, arising from your use of or inability to
              use the Service. Our total liability for any claims arising from
              or related to these Terms or the Service shall not exceed the
              amount you paid to Raute in the twelve (12) months preceding the
              claim.
            </p>
          </section>

          {/* 11. Disclaimer of Warranties */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              11. Disclaimer of Warranties
            </h2>
            <p>
              The Service is provided on an &quot;as is&quot; and &quot;as
              available&quot; basis without warranties of any kind, whether
              express or implied, including but not limited to implied warranties
              of merchantability, fitness for a particular purpose, and
              non-infringement. We do not warrant that the Service will meet your
              specific requirements, that route calculations will be optimal in
              all conditions, or that delivery tracking will be accurate at all
              times.
            </p>
          </section>

          {/* 12. Indemnification */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              12. Indemnification
            </h2>
            <p>
              You agree to indemnify, defend, and hold harmless Raute, its
              affiliates, and their respective officers, directors, employees,
              and agents from any claims, damages, losses, liabilities, and
              expenses (including reasonable attorney fees) arising from your
              use of the Service, your violation of these Terms, or your
              violation of any rights of a third party.
            </p>
          </section>

          {/* 13. Termination */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              13. Termination
            </h2>
            <p>
              We may terminate or suspend your access to the Service
              immediately, without prior notice or liability, for any reason,
              including if you breach these Terms. Upon termination, your right
              to use the Service will immediately cease. You may terminate your
              account at any time by using the account deletion feature in the
              application or by contacting us. Provisions of these Terms that by
              their nature should survive termination will remain in effect.
            </p>
          </section>

          {/* 14. Governing Law */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              14. Governing Law
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with
              the laws of the United States. Any disputes arising from these
              Terms or the Service shall be resolved in the courts of competent
              jurisdiction.
            </p>
          </section>

          {/* 15. Changes to Terms */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              15. Changes to These Terms
            </h2>
            <p>
              We reserve the right to modify these Terms at any time. We will
              notify you of material changes by posting the updated Terms on our
              platform and updating the &quot;Last updated&quot; date. Your
              continued use of the Service after changes are posted constitutes
              acceptance of the revised Terms. If you do not agree to the
              updated Terms, you must stop using the Service.
            </p>
          </section>

          {/* 16. Contact Us */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              16. Contact Us
            </h2>
            <p>
              If you have any questions about these Terms of Service, please
              contact us:
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
