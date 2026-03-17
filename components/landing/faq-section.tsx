'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const faqs = [
    {
        q: 'How does the 7-day free trial work?',
        a: 'Sign up with just your email — no credit card required. You get full access to all features for 7 days. If you love it, pick a plan. If not, your account simply pauses. No charges, no hassle.',
    },
    {
        q: 'Can I change my plan later?',
        a: 'Absolutely. Upgrade or downgrade anytime from your dashboard. Changes take effect immediately and billing is prorated — you only pay for what you use.',
    },
    {
        q: 'What happens to my founding member discount if I change plans?',
        a: 'Your 50% founding member discount is locked to the plan you originally subscribed to. If you switch to a different plan, the discount will not carry over. This encourages you to pick the right plan from the start.',
    },
    {
        q: 'Do my drivers need a separate account?',
        a: 'Drivers download the free Raute mobile app and are invited by you through the dashboard. They get their own login with access to their routes, navigation, and proof of delivery — all managed by you.',
    },
    {
        q: 'How does AI Order Parsing work?',
        a: 'Just paste your order list (from a spreadsheet, email, or even messy text) and our AI extracts names, addresses, phone numbers, and notes automatically. It also cleans and validates addresses using geocoding. What used to take hours now takes seconds.',
    },
    {
        q: 'Is my data secure?',
        a: 'Yes. We use enterprise-grade encryption (AES-256), secure authentication via Supabase, and all data is hosted on secure cloud infrastructure. We never share your data with third parties.',
    },
    {
        q: 'Can I cancel anytime?',
        a: 'Yes, cancel anytime from your dashboard with one click. No cancellation fees, no lock-in contracts. Your data stays available for 30 days after cancellation in case you want to come back.',
    },
]

export function FAQSection() {
    const [openIndex, setOpenIndex] = useState<number | null>(0)

    return (
        <section className="py-24 bg-white dark:bg-slate-950">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-blue-600 dark:text-blue-400 font-semibold tracking-wide uppercase text-sm mb-3">FAQ</h2>
                    <h3 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                        Got questions? We have answers
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-400">
                        Everything you need to know before getting started.
                    </p>
                </div>

                <div className="space-y-3">
                    {faqs.map((faq, idx) => {
                        const isOpen = openIndex === idx
                        return (
                            <div
                                key={idx}
                                className={`border rounded-xl transition-all duration-200 ${
                                    isOpen
                                        ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm'
                                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                            >
                                <button
                                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                                    className="w-full flex items-center justify-between p-5 text-left"
                                >
                                    <span className={`font-semibold pr-4 ${isOpen ? 'text-blue-700 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                                        {faq.q}
                                    </span>
                                    <ChevronDown
                                        size={20}
                                        className={`shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : ''}`}
                                    />
                                </button>
                                {isOpen && (
                                    <div className="px-5 pb-5 pt-0 text-sm text-slate-600 dark:text-slate-400 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200">
                                        {faq.a}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
