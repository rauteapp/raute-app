'use client'

import { Clock } from 'lucide-react'
import Link from 'next/link'

interface TrialBannerProps {
    daysRemaining: number
}

export function TrialBanner({ daysRemaining }: TrialBannerProps) {
    if (daysRemaining <= 0) return null

    const isUrgent = daysRemaining <= 2

    return (
        <div className={`w-full px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 shrink-0 ${
            isUrgent
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
        }`}>
            <Clock size={14} />
            <span>
                {daysRemaining === 1 ? '1 day' : `${daysRemaining} days`} left in your free trial.
            </span>
            <Link href="/subscribe" className="underline font-semibold ml-1">
                Subscribe now
            </Link>
        </div>
    )
}
