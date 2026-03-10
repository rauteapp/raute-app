'use client'

import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function TrialFreezeOverlay() {
    return (
        <div className="fixed inset-0 z-[100] bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-6">
                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
                    <ShieldAlert size={32} className="text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Your free trial has ended
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                    Subscribe to continue managing drivers, creating orders, and optimizing routes.
                    Your data is safe and waiting for you.
                </p>
                <div className="space-y-3">
                    <Link href="/subscribe" className="block">
                        <Button size="lg" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12">
                            View Plans & Subscribe
                        </Button>
                    </Link>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Plans start at $12.50/month (founding member price)
                    </p>
                </div>
            </div>
        </div>
    )
}
