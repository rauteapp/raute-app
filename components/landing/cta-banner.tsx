'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function CtaBanner() {
    return (
        <section className="py-16 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 relative overflow-hidden">
            {/* Subtle pattern */}
            <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-[0.05]" />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
                <h3 className="text-2xl lg:text-3xl font-extrabold text-white mb-3">
                    Ready to optimize your last mile?
                </h3>
                <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
                    Join hundreds of logistics teams who save hours every day with Raute.
                    Start your free trial — no credit card required.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link href="/signup">
                        <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-bold rounded-full px-8 h-12 shadow-xl shadow-blue-900/20 hover:-translate-y-0.5 transition-all">
                            Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                    <Link href="#pricing">
                        <Button variant="ghost" size="lg" className="text-white hover:bg-white/10 font-medium rounded-full px-8 h-12 border border-white/20">
                            View Pricing
                        </Button>
                    </Link>
                </div>
            </div>
        </section>
    )
}
