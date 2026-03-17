import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, ChevronRight, X, Power, MapPin, Sparkles } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

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
            description: 'Toggle your status to start receiving orders.',
            onClick: onToggleOnline,
            isComplete: isOnline,
            icon: Power
        },
        {
            id: 2,
            title: 'View Assignments',
            description: 'Check your active delivery tasks for today.',
            onClick: onViewAssignments,
            isComplete: hasTasks,
            icon: MapPin
        }
    ]

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="mb-6"
                >
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 p-1 shadow-2xl">
                        {/* Decorative background glow */}
                        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
                        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />

                        <div className="relative rounded-xl bg-slate-950/50 backdrop-blur-xl p-5 border border-white/10">
                            <button
                                onClick={handleDismiss}
                                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-1.5 rounded-full"
                                aria-label="Dismiss guide"
                            >
                                <X size={16} />
                            </button>

                            <div className="flex flex-col gap-5">
                                <div className="space-y-2 pr-8">
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-bold border border-indigo-500/30 uppercase tracking-widest">
                                        <Sparkles size={12} />
                                        Getting Started
                                    </div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">Ready for your shift?</h2>
                                    <p className="text-slate-400 text-sm leading-relaxed">
                                        Complete these quick steps to set up your vehicle and start accepting deliveries.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {steps.map((step, index) => (
                                        <motion.div
                                            key={step.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.1 + 0.2 }}
                                            onClick={step.onClick}
                                            className={`group relative flex items-center justify-between p-4 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${step.isComplete
                                                ? 'bg-green-500/10 border-green-500/30'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]'
                                                }`}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            {/* Step highlight effect on hover */}
                                            {!step.isComplete && (
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                                            )}

                                            <div className="flex items-center gap-4 relative z-10 w-full">
                                                <div className="relative">
                                                    <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${step.isComplete
                                                        ? 'bg-green-500 text-slate-950'
                                                        : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700 group-hover:text-white'
                                                        }`}>
                                                        {step.isComplete ? (
                                                            <motion.div
                                                                initial={{ scale: 0 }}
                                                                animate={{ scale: 1 }}
                                                                transition={{ type: "spring", bounce: 0.5 }}
                                                            >
                                                                <CheckCircle2 size={24} className="fill-green-950/20" />
                                                            </motion.div>
                                                        ) : (
                                                            <step.icon size={22} className={index === 0 ? "group-hover:text-amber-400 transition-colors" : "group-hover:text-blue-400 transition-colors"} />
                                                        )}
                                                    </div>
                                                    
                                                    {/* Connecting line between steps */}
                                                    {index === 0 && (
                                                        <div className="absolute left-1/2 bottom-0 w-0.5 h-6 bg-slate-800 translate-y-full -translate-x-1/2 z-0 hidden lg:block" />
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0 pr-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className={`text-base font-bold truncate transition-colors ${step.isComplete ? 'text-green-400' : 'text-slate-100 group-hover:text-white'}`}>
                                                            {step.title}
                                                        </p>
                                                        {!step.isComplete && (
                                                            <ChevronRight size={16} className="text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-400 leading-tight mt-1 line-clamp-2">
                                                        {step.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
