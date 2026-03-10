'use client'

import { Smartphone, Apple } from 'lucide-react'
import { Button } from '@/components/ui/button'

const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || '#'

export function DownloadSection() {
    return (
        <section className="py-20 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-100/50 dark:bg-blue-900/20 rounded-full blur-[100px] pointer-events-none" />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
                <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-full text-sm font-semibold mb-6">
                    <Smartphone size={16} />
                    Available on iOS
                </div>

                <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                    Manage deliveries on the go
                </h2>
                <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto">
                    Download the Raute app for real-time tracking, push notifications, and offline mode.
                    Your drivers get their own app with turn-by-turn navigation.
                </p>

                <a
                    href={APP_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block"
                >
                    <Button size="lg" className="bg-black hover:bg-slate-800 text-white font-bold h-14 px-8 rounded-2xl shadow-lg gap-3 text-base">
                        <Apple size={24} />
                        Download on the App Store
                    </Button>
                </a>

                <p className="text-xs text-slate-400 mt-4">
                    Requires iOS 16.0 or later. Android coming soon.
                </p>
            </div>
        </section>
    )
}
