import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Cookie Policy | Raute',
  description: 'Cookie Policy for Raute.io by Howl Dating LLC. Learn about the types of cookies we use, how to manage them, and third-party cookie providers.',
}

export default function CookiePolicy() {
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
          Cookie Policy
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          Last updated: March 11, 2026
        </p>

        <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* 9.1 What Are Cookies */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              9.1 What Are Cookies
            </h2>
            <p>
              Cookies are small text files that are placed on your device when
              you visit a website or use a web application. They are widely used
              to make websites work more efficiently, provide a better user
              experience, and supply information to the site operators. This
              Cookie Policy explains how Raute.io uses cookies and similar
              technologies when you use our platform.
            </p>
          </section>

          {/* 9.2 Types of Cookies We Use */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              9.2 Types of Cookies We Use
            </h2>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              A) Strictly Necessary Cookies
            </h3>
            <p className="mb-4">
              These cookies are essential for the platform to function properly.
              They enable core features such as authentication, session
              management, and security. Without these cookies, the Service
              cannot operate as intended. These cookies do not require your
              consent.
            </p>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              B) Performance &amp; Analytics Cookies
            </h3>
            <p className="mb-4">
              These cookies collect information about how you use the platform,
              such as which pages you visit, how long you spend on the site,
              and any errors you encounter. This data is aggregated and
              anonymized and is used to improve the performance and usability
              of the Service.
            </p>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              C) Functional Cookies
            </h3>
            <p className="mb-4">
              These cookies remember your preferences and settings (such as
              language, timezone, or display preferences) to provide a more
              personalized experience. They may also be used to remember
              choices you have made on the platform.
            </p>

            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
              D) Marketing Cookies
            </h3>
            <p>
              Marketing cookies are used to track visitors across websites and
              display relevant advertisements. We only use marketing cookies
              with your explicit consent. You may opt out of marketing cookies
              at any time through your browser settings or our cookie
              preferences.
            </p>
          </section>

          {/* 9.3 Managing Cookies */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              9.3 Managing Cookies
            </h2>
            <p>
              You can control and manage cookies through your browser settings.
              Most browsers allow you to view, delete, and block cookies from
              websites. Please note that disabling or blocking certain cookies
              (particularly strictly necessary cookies) may affect the
              functionality of the Raute.io platform and prevent some features
              from working properly. For instructions on managing cookies in
              your specific browser, please refer to your browser&apos;s help
              documentation.
            </p>
          </section>

          {/* 9.4 Third-Party Cookies */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              9.4 Third-Party Cookies
            </h2>
            <p className="mb-3">
              Some cookies on our platform are set by third-party services that
              we use. These include:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Analytics Providers:</strong> We use analytics services
                to understand how users interact with our platform and to
                improve the Service.
              </li>
              <li>
                <strong>Payment Processors:</strong> Our payment provider
                (Stripe) may set cookies necessary for secure payment
                processing and fraud prevention.
              </li>
            </ul>
            <p className="mt-3">
              These third-party providers have their own privacy and cookie
              policies. We encourage you to review their policies for more
              information about how they use cookies. For more details about
              how we handle your data, please see our{' '}
              <Link
                href="/privacy"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
