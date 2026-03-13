import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Service | Raute',
  description: 'Terms of Service for Raute.io by Howl Dating LLC. Read about user responsibilities, acceptable use, subscription plans, intellectual property, liability, and dispute resolution.',
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
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 1.1 Agreement to Terms */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.1 Agreement to Terms
            </h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) constitute a legally
              binding agreement between you (&quot;User,&quot; &quot;you,&quot;
              or &quot;your&quot;) and Howl Dating LLC, doing business as
              Raute.io (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or
              &quot;us&quot;). By accessing or using the Raute.io platform
              (&quot;Service&quot;), available at{' '}
              <a
                href="https://raute.io"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                raute.io
              </a>{' '}
              and through our mobile applications, you acknowledge that you have
              read, understood, and agree to be bound by these Terms. If you do
              not agree to these Terms, you must not access or use the Service.
            </p>
          </section>

          {/* 1.2 Description of Service */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.2 Description of Service
            </h2>
            <p>
              Raute.io is a route optimization and delivery management platform
              designed for logistics operations. The Service includes route
              planning, driver coordination, delivery tracking, fleet
              management, and analytics tools. Raute.io is offered as a
              Software-as-a-Service (SaaS) subscription, providing web-based
              dashboards and mobile applications for dispatchers, drivers, and
              administrators.
            </p>
          </section>

          {/* 1.3 Eligibility */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.3 Eligibility
            </h2>
            <p className="mb-3">
              To use the Service, you must meet all of the following
              requirements:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>Be at least 18 years of age.</li>
              <li>
                Have the legal capacity to enter into a binding agreement.
              </li>
              <li>
                Not be prohibited from using the Service under any applicable
                law or regulation.
              </li>
              <li>
                Provide accurate and complete registration information.
              </li>
            </ul>
          </section>

          {/* 1.4 Account Registration & Security */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.4 Account Registration &amp; Security
            </h2>
            <p>
              You must provide truthful, accurate, and complete information when
              creating an account. You are solely responsible for maintaining
              the security and confidentiality of your account credentials,
              including your password. You agree to accept responsibility for
              all activities that occur under your account. You must notify us
              immediately at{' '}
              <a
                href="mailto:support@raute.io"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@raute.io
              </a>{' '}
              if you become aware of any unauthorized access to or use of your
              account.
            </p>
          </section>

          {/* 1.5 Subscription Plans & Payment */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.5 Subscription Plans &amp; Payment
            </h2>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Plans:</strong> Raute.io offers various subscription
                plans as described on our pricing page. Features and limits vary
                by plan.
              </li>
              <li>
                <strong>Billing:</strong> All subscriptions are billed on a
                recurring basis in United States Dollars (USD). Payments are
                processed through our third-party payment provider.
              </li>
              <li>
                <strong>Price Changes:</strong> We will provide at least 30
                days&apos; written notice before any changes to subscription
                pricing take effect.
              </li>
              <li>
                <strong>Non-Payment:</strong> Failure to make timely payments
                may result in suspension or termination of your account and
                access to the Service.
              </li>
            </ul>
          </section>

          {/* 1.6 Intellectual Property */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.6 Intellectual Property
            </h2>
            <p className="mb-3">
              All content, software, features, and branding associated with the
              Service are the property of Howl Dating LLC and are protected by
              applicable intellectual property laws. You retain full ownership
              of the data you upload to the platform.
            </p>
            <p>
              By using the Service, you grant Howl Dating LLC a limited,
              non-exclusive license to process, store, and use your data solely
              for the purpose of providing and improving the Service. This
              license terminates when you delete your data or close your
              account.
            </p>
          </section>

          {/* 1.7 User Conduct */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.7 User Conduct
            </h2>
            <p className="mb-3">
              You agree not to engage in any of the following prohibited
              activities:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                Violating any applicable local, state, national, or
                international law or regulation.
              </li>
              <li>
                Infringing upon the intellectual property rights or privacy
                rights of any third party.
              </li>
              <li>
                Transmitting malware, viruses, or any harmful or malicious code
                through the platform.
              </li>
              <li>
                Attempting to gain unauthorized access to the Service, other
                user accounts, or our systems and infrastructure.
              </li>
              <li>
                Disrupting, interfering with, or degrading the operation or
                performance of the Service.
              </li>
            </ul>
          </section>

          {/* 1.8 Service Availability & Modifications */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.8 Service Availability &amp; Modifications
            </h2>
            <p>
              We strive to maintain high availability but do not guarantee
              uninterrupted, error-free, or secure access to the Service at all
              times. The Service may be temporarily unavailable due to
              maintenance, updates, or circumstances beyond our control. We
              reserve the right to modify, suspend, or discontinue any aspect
              of the Service at any time, with or without notice.
            </p>
          </section>

          {/* 1.9 Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.9 Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by applicable law, Howl Dating LLC
              and its officers, directors, employees, and agents shall not be
              liable for any indirect, incidental, special, consequential, or
              punitive damages, including but not limited to loss of profits,
              data, business opportunities, or goodwill, arising from your use
              of or inability to use the Service. Our total aggregate liability
              for any claims arising from or related to these Terms or the
              Service shall not exceed the total amount you paid to Howl Dating
              LLC during the twelve (12) months immediately preceding the event
              giving rise to the claim.
            </p>
          </section>

          {/* 1.10 Indemnification */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.10 Indemnification
            </h2>
            <p>
              You agree to indemnify, defend, and hold harmless Howl Dating LLC,
              its affiliates, and their respective officers, directors,
              employees, and agents from and against any and all claims,
              damages, losses, liabilities, costs, and expenses (including
              reasonable attorneys&apos; fees) arising from or related to your
              use of the Service, your violation of these Terms, or your
              violation of any rights of a third party.
            </p>
          </section>

          {/* 1.11 Governing Law & Dispute Resolution */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.11 Governing Law &amp; Dispute Resolution
            </h2>
            <p className="mb-3">
              These Terms shall be governed by and construed in accordance with
              the laws of the State of California, without regard to its
              conflict of law provisions.
            </p>
            <p className="mb-3">
              In the event of any dispute arising from or relating to these
              Terms or the Service, the parties agree to first attempt
              resolution through good-faith mediation. If mediation is
              unsuccessful, disputes shall be resolved through binding
              arbitration administered by the American Arbitration Association
              (AAA) in accordance with its Commercial Arbitration Rules. The
              arbitration shall take place in the State of California.
            </p>
          </section>

          {/* 1.12 Severability */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.12 Severability
            </h2>
            <p>
              If any provision of these Terms is found to be unenforceable or
              invalid by a court of competent jurisdiction, that provision shall
              be limited or eliminated to the minimum extent necessary so that
              these Terms shall otherwise remain in full force and effect.
            </p>
          </section>

          {/* 1.13 Entire Agreement */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.13 Entire Agreement
            </h2>
            <p>
              These Terms, together with the Privacy Policy and any other legal
              notices or policies published by us on the Service, constitute the
              entire agreement between you and Howl Dating LLC regarding your
              use of the Service. These Terms supersede all prior or
              contemporaneous communications, proposals, and agreements, whether
              oral or written, between you and Howl Dating LLC with respect to
              the Service.
            </p>
          </section>

          {/* 1.14 Contact */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              1.14 Contact
            </h2>
            <p>
              If you have any questions about these Terms of Service, please
              contact us:
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
