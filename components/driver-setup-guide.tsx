import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, ChevronRight, X, Power, MapPin, Navigation } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export function DriverSetupGuide({
    isOnline,
    hasTasks,
    onToggleOnline,
    onViewAssignments,
    forceShow = false,
    onDismiss
}: {
    isOnline: boolean,
    hasTasks: boolean,
    onToggleOnline: () => void,
    onViewAssignments: () => void,
    forceShow?: boolean,
    onDismiss?: () => void
}) {
    const [isVisible, setIsVisible] = useState(true)

    // Handle external dismiss
    const handleDismiss = () => {
        setIsVisible(false)
        if (onDismiss) onDismiss()
    }

    // Determine visibility logic
    if (forceShow) {
        // Show regardless of status
    } else {
        // Hide if completed
        if (isOnline && hasTasks) return null
        // Hide if manually dismissed
        if (!isVisible) return null
    }

    const steps = [
        {
            id: 1,
            title: 'Go Online',
            description: 'Start your shift to get orders',
            action: 'Toggle Status',
            onClick: onToggleOnline,
            isComplete: isOnline,
            icon: Power
        },
        {
            id: 2,
            title: 'Check Orders',
            description: 'Review your pending tasks',
            action: 'View Tasks',
            onClick: onViewAssignments,
            isComplete: hasTasks,
            icon: MapPin
        }
    ]

    return (
        <div className="bg-white dark:bg-[#18181B] rounded-[24px] shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-slate-100 dark:border-slate-800/60 overflow-hidden relative mb-6">
            <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-10 bg-slate-50 dark:bg-slate-800 rounded-full p-1.5"
                aria-label="Dismiss guide"
            >
                <X size={16} />
            </button>
            
            <div className="p-5 relative z-10 w-full">
                <div className="flex flex-col gap-4 w-full">
                    <div className="space-y-1 w-full">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-[11px] font-bold uppercase tracking-wider mb-1">
                            <Navigation size={12} className="fill-current" /> Quick Start
                        </div>
                        <h2 className="text-[22px] font-black text-slate-900 dark:text-white mt-1 leading-tight tracking-tight">Driver Checklist</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-[15px]">
                            Complete these steps to begin.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 w-full mt-2">
                        {steps.map((step) => (
                            <div
                                key={step.id}
                                onClick={step.onClick}
                                className={cn(
                                    "flex items-center justify-between p-4 rounded-[20px] transition-all cursor-pointer active:scale-95 group w-full",
                                    step.isComplete
                                        ? "bg-emerald-50/40 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20"
                                        : "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-[0_1px_4px_rgba(0,0,0,0.02)]"
                                )}
                                role="button"
                                tabIndex={0}
                            >
                                <div className="flex items-center gap-4 w-full">
                                    <div className={cn(
                                        "h-[46px] w-[46px] flex items-center justify-center rounded-full shrink-0 transition-colors border-2",
                                        step.isComplete 
                                            ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20" 
                                            : "bg-slate-50 dark:bg-[#18181B] border-slate-100 dark:border-slate-800 text-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                                    )}>
                                        {step.isComplete ? <CheckCircle2 size={22} className="text-white" /> : <step.icon size={22} strokeWidth={2.5} />}
                                    </div>
                                    <div className="flex-1 w-full flex justify-between items-center group-hover:px-1 transition-all">
                                        <div>
                                            <p className={cn(
                                                "text-[16px] font-bold transition-colors leading-tight",
                                                step.isComplete ? "text-emerald-700 dark:text-emerald-400" : "text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400"
                                            )}>
                                                {step.title}
                                            </p>
                                            <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">{step.description}</p>
                                        </div>
                                        {!step.isComplete && <ChevronRight size={18} strokeWidth={3} className="text-slate-200 dark:text-slate-700 group-hover:text-blue-500 transition-colors" />}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
