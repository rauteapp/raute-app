'use client'

import { useState } from 'react'
import { Check, Loader2, ArrowLeft, Crown, Zap, Rocket, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast-provider'
import { Capacitor } from '@capacitor/core'
import { RevenueCatService } from '@/lib/revenuecat-service'
import Link from 'next/link'

const plans = [
    {
        id: 'starter',
        name: 'Starter',
        icon: Zap,
        monthlyProductId: 'raute_starter_monthly',
        annualProductId: 'raute_starter_annual',
        price: '$24.99',
        foundingPrice: '$12.50',
        annualPrice: '$249.99',
        annualFoundingPrice: '$125',
        drivers: 5,
        orders: '500',
        support: 'Email Support',
        color: 'blue',
        popular: false,
    },
    {
        id: 'pro',
        name: 'Pro',
        icon: Crown,
        monthlyProductId: 'raute_pro_monthly',
        annualProductId: 'raute_pro_annual',
        price: '$59.99',
        foundingPrice: '$30',
        annualPrice: '$599.99',
        annualFoundingPrice: '$300',
        drivers: 15,
        orders: '2,000',
        support: 'Priority Email Support',
        color: 'blue',
        popular: true,
    },
    {
        id: 'pioneer',
        name: 'Pioneer',
        icon: Rocket,
        monthlyProductId: 'raute_pioneer_monthly',
        annualProductId: 'raute_pioneer_annual',
        price: '$99.99',
        foundingPrice: '$50',
        annualPrice: '$999.99',
        annualFoundingPrice: '$500',
        drivers: 40,
        orders: '10,000',
        support: 'Dedicated Support',
        color: 'purple',
        popular: false,
    },
]

export default function SubscribePage() {
    const [isPurchasing, setPurchasing] = useState<string | null>(null)
    const [isRestoring, setRestoring] = useState(false)
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
    const { toast } = useToast()
    const isNative = Capacitor.isNativePlatform()

    const handlePurchase = async (plan: typeof plans[0]) => {
        if (!isNative) {
            toast({
                title: 'Available on iOS',
                description: 'Please use the Raute iOS app to subscribe.',
                type: 'info',
            })
            return
        }

        setPurchasing(plan.id)
        try {
            const offerings = await RevenueCatService.getOfferings()
            if (!offerings || !offerings.availablePackages?.length) {
                toast({ title: 'Error', description: 'No plans available. Please try again later.', type: 'error' })
                return
            }

            const targetProductId = billingCycle === 'annual' ? plan.annualProductId : plan.monthlyProductId

            const pkg = offerings.availablePackages.find(
                (p: any) => p.product?.identifier === targetProductId
            )

            if (!pkg) {
                toast({ title: 'Error', description: 'Plan not found. Please try again.', type: 'error' })
                return
            }

            const result = await RevenueCatService.purchase(pkg)
            if (result.success) {
                toast({
                    title: 'Subscription Activated!',
                    description: `You're now on the ${plan.name} plan with ${plan.drivers} driver slots.`,
                    type: 'success',
                })
                // The useTrialStatus hook will auto-detect via realtime and remove freeze
            }
        } catch (e) {
            console.error('Purchase error:', e)
            toast({ title: 'Purchase Failed', description: 'Something went wrong. Please try again.', type: 'error' })
        } finally {
            setPurchasing(null)
        }
    }

    const handleRestore = async () => {
        if (!isNative) {
            toast({
                title: 'Available on iOS',
                description: 'Please use the Raute iOS app to restore purchases.',
                type: 'info',
            })
            return
        }

        setRestoring(true)
        try {
            toast({ title: 'Restoring...', description: 'Checking for existing subscriptions...', type: 'info' })
            const result = await RevenueCatService.restorePurchases()
            if (result.success && result.newDriverLimit && result.newDriverLimit > 5) {
                toast({
                    title: 'Restored!',
                    description: `Your subscription includes ${result.newDriverLimit} driver slots.`,
                    type: 'success',
                })
            } else {
                toast({ title: 'No purchases found', description: 'No active subscription to restore.', type: 'info' })
            }
        } catch (e) {
            toast({ title: 'Restore failed', description: 'Please try again.', type: 'error' })
        } finally {
            setRestoring(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
                    <Link href="/drivers" className="p-2 -ml-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                        <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
                    </Link>
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">Choose a Plan</h1>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                {/* Founding Member Banner */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-center text-white shadow-lg shadow-blue-500/20">
                    <p className="text-xs font-bold uppercase tracking-wide mb-1 text-blue-100">Founding Member Deal</p>
                    <p className="text-xl font-extrabold">50% off for 12 months</p>
                    <p className="text-blue-100 text-sm mt-1">First 100 users get half price on any plan</p>
                </div>

                {/* Billing Cycle Toggle */}
                <div className="flex items-center justify-center gap-1 bg-white dark:bg-slate-900 rounded-full p-1 border border-slate-200 dark:border-slate-800 max-w-xs mx-auto">
                    <button
                        onClick={() => setBillingCycle('monthly')}
                        className={`flex-1 py-2 px-4 rounded-full text-sm font-semibold transition-all ${
                            billingCycle === 'monthly'
                                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setBillingCycle('annual')}
                        className={`flex-1 py-2 px-4 rounded-full text-sm font-semibold transition-all ${
                            billingCycle === 'annual'
                                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Annual
                    </button>
                </div>

                {/* Plans */}
                <div className="space-y-4">
                    {plans.map((plan) => {
                        const Icon = plan.icon
                        const isCurrentPurchasing = isPurchasing === plan.id
                        const displayPrice = billingCycle === 'annual' ? plan.annualFoundingPrice : plan.foundingPrice
                        const originalPrice = billingCycle === 'annual' ? plan.annualPrice : plan.price
                        const period = billingCycle === 'annual' ? '/year' : '/month'

                        return (
                            <div
                                key={plan.id}
                                className={`relative bg-white dark:bg-slate-900 rounded-2xl p-5 border-2 transition-all ${
                                    plan.popular
                                        ? 'border-blue-500 dark:border-blue-500 shadow-lg shadow-blue-500/10'
                                        : 'border-slate-200 dark:border-slate-800'
                                }`}
                            >
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                                        Most Popular
                                    </div>
                                )}

                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                            plan.popular
                                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                : plan.color === 'purple'
                                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                        }`}>
                                            <Icon size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                                            <p className="text-xs text-slate-500">{plan.drivers} drivers &bull; {plan.orders} orders/mo</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-sm text-slate-400 line-through">{originalPrice}</span>
                                            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{displayPrice}</span>
                                        </div>
                                        <span className="text-xs text-slate-500">{period}</span>
                                    </div>
                                </div>

                                {/* Features */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                    <span className="inline-flex items-center gap-1 text-xs bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                                        <Check size={12} className="text-green-500" /> {plan.drivers} Drivers
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                                        <Check size={12} className="text-green-500" /> {plan.orders} Orders/mo
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                                        <Check size={12} className="text-green-500" /> All Features
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                                        <Check size={12} className="text-green-500" /> {plan.support}
                                    </span>
                                </div>

                                <Button
                                    onClick={() => handlePurchase(plan)}
                                    disabled={!!isPurchasing || isRestoring}
                                    className={`w-full font-bold h-11 rounded-xl ${
                                        plan.popular
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                                            : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100'
                                    }`}
                                >
                                    {isCurrentPurchasing ? (
                                        <><Loader2 className="animate-spin mr-2" size={16} /> Processing...</>
                                    ) : (
                                        `Choose ${plan.name}`
                                    )}
                                </Button>
                            </div>
                        )
                    })}
                </div>

                {/* Features included */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800">
                    <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">All Plans Include</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            'Route Optimization',
                            'Real-time GPS Tracking',
                            'AI Order Parsing',
                            'AI Address Cleaning',
                            'Proof of Delivery',
                            'Push Notifications',
                            'Drag & Drop Planner',
                            'Offline Mode',
                        ].map((feature) => (
                            <div key={feature} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                <Check size={12} className="text-green-500 shrink-0" />
                                {feature}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Restore Purchases */}
                <div className="text-center pb-8">
                    <button
                        onClick={handleRestore}
                        disabled={!!isPurchasing || isRestoring}
                        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline transition-colors"
                    >
                        {isRestoring ? (
                            <><Loader2 className="animate-spin" size={14} /> Restoring...</>
                        ) : (
                            <><RefreshCw size={14} /> Restore Purchases</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
