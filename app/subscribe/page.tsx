'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, ArrowLeft, Crown, Zap, Rocket, RefreshCw, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast-provider'
import { Capacitor } from '@capacitor/core'
import { RevenueCatService } from '@/lib/revenuecat-service'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const plans = [
    {
        id: 'starter',
        name: 'Starter',
        icon: Zap,
        monthlyProductId: 'raute_starter_monthly',
        annualProductId: 'raute_starter_annual',
        price: '$24.99',
        foundingPrice: '$12.50',
        annualPrice: '$249.90',
        annualFoundingPrice: '$124.95',
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
        foundingPrice: '$30.00',
        annualPrice: '$599.90',
        annualFoundingPrice: '$299.95',
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
        foundingPrice: '$50.00',
        annualPrice: '$999.90',
        annualFoundingPrice: '$499.95',
        drivers: 40,
        orders: '10,000',
        support: 'Dedicated Support',
        color: 'purple',
        popular: true,
    },
]

export default function SubscribePage() {
    const [isPurchasing, setPurchasing] = useState<string | null>(null)
    const [isRestoring, setRestoring] = useState(false)
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
    const [foundingMember, setFoundingMember] = useState<{ count: number; limit: number; active: boolean } | null>(null)
    const [currentPlanId, setCurrentPlanId] = useState<string | null>(null)
    const [promoCode, setPromoCode] = useState('')
    const [promoApplied, setPromoApplied] = useState(false)
    const { toast } = useToast()
    const isNative = Capacitor.isNativePlatform()
    const searchParams = useSearchParams()

    // Check for Stripe redirect result
    useEffect(() => {
        if (searchParams.get('success') === 'true') {
            toast({ title: 'Subscription Activated!', description: 'Welcome to Raute! Your account has been upgraded.', type: 'success' })
        } else if (searchParams.get('canceled') === 'true') {
            toast({ title: 'Checkout Cancelled', description: 'No changes were made to your account.', type: 'info' })
        }
    }, [searchParams])

    // Load founding member counter + current subscription
    useEffect(() => {
        async function loadConfig() {
            const { data: { user } } = await supabase.auth.getUser()

            const { data, error: configError } = await supabase
                .from('app_config')
                .select('value')
                .eq('key', 'founding_members')
                .single()
            if (!configError && data?.value) {
                setFoundingMember(data.value as any)
            }

            if (user) {
                const { data: sub } = await supabase
                    .from('subscription_history')
                    .select('tier_name')
                    .eq('user_id', user.id)
                    .eq('is_active', true)
                    .limit(1)
                    .maybeSingle()
                if (sub?.tier_name) {
                    const name = sub.tier_name
                        .replace(/^(raute_|stripe_)/, '')
                        .replace(/_(monthly|annual)$/, '')
                    setCurrentPlanId(name.toLowerCase())
                }
            }
        }
        loadConfig()
    }, [])

    const isFoundingActive = foundingMember?.active && (foundingMember.count < foundingMember.limit)
    const spotsRemaining = foundingMember ? foundingMember.limit - foundingMember.count : 100

    // iOS: RevenueCat purchase
    const handleNativePurchase = async (plan: typeof plans[0]) => {
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
            }
        } catch (e) {
            console.error('Purchase error:', e)
            toast({ title: 'Purchase Failed', description: 'Something went wrong. Please try again.', type: 'error' })
        } finally {
            setPurchasing(null)
        }
    }

    // Web: Stripe Checkout
    const handleWebPurchase = async (plan: typeof plans[0]) => {
        setPurchasing(plan.id)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                toast({ title: 'Please log in', description: 'You need to be logged in to subscribe.', type: 'error' })
                return
            }

            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    planId: plan.id,
                    billingCycle,
                    promoCode: promoApplied ? promoCode.trim() : undefined,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                toast({ title: 'Error', description: data.error || 'Failed to start checkout.', type: 'error' })
                return
            }

            if (data.url) {
                window.location.href = data.url
            }
        } catch (e) {
            console.error('Checkout error:', e)
            toast({ title: 'Checkout Failed', description: 'Something went wrong. Please try again.', type: 'error' })
        } finally {
            setPurchasing(null)
        }
    }

    const handlePurchase = async (plan: typeof plans[0]) => {
        if (isNative) {
            await handleNativePurchase(plan)
        } else {
            await handleWebPurchase(plan)
        }
    }

    const handleRestore = async () => {
        if (!isNative) {
            toast({ title: 'Restore', description: 'Web subscriptions are managed through Stripe. If you have an active subscription, your account should update automatically.', type: 'info' })
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

    const handleApplyPromo = () => {
        if (!promoCode.trim()) return
        setPromoApplied(true)
        toast({ title: 'Promo code applied!', description: 'Discount will be applied at checkout.', type: 'success' })
    }

    const handleRemovePromo = () => {
        setPromoCode('')
        setPromoApplied(false)
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
                    <Link href="/dashboard" className="p-2 -ml-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                        <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
                    </Link>
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white">Choose a Plan</h1>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                {/* Founding Member Banner */}
                {isFoundingActive && (
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-center text-white shadow-lg shadow-blue-500/20">
                        <p className="text-xs font-bold uppercase tracking-wide mb-1 text-blue-100">Founding Member Offer</p>
                        <p className="text-xl font-extrabold">50% off for your first 12 months</p>
                        <p className="text-blue-100 text-sm mt-1">
                            <span className="font-bold text-white">{spotsRemaining}</span> of {foundingMember?.limit} spots remaining
                        </p>
                        {!promoApplied && (
                            <p className="text-blue-200 text-xs mt-2">
                                Use code <span className="font-bold text-white bg-white/20 px-2 py-0.5 rounded">FOUNDING50</span> at checkout
                            </p>
                        )}
                    </div>
                )}

                {/* Regular pricing notice when founding is over */}
                {foundingMember && !isFoundingActive && (
                    <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl p-4 text-center border border-slate-200 dark:border-slate-800">
                        <p className="text-sm text-slate-600 dark:text-slate-400">Founding member offer has ended. Subscribe at regular pricing below.</p>
                    </div>
                )}

                {/* Promo Code Field (Web only) */}
                {!isNative && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                        {promoApplied ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Tag size={16} className="text-green-600" />
                                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                                        Promo code applied: <span className="font-mono">{promoCode}</span>
                                    </span>
                                </div>
                                <button onClick={handleRemovePromo} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                    <X size={16} className="text-slate-400" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={promoCode}
                                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                        placeholder="Have a promo code?"
                                        className="w-full pl-9 pr-3 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                                    />
                                </div>
                                <Button
                                    onClick={handleApplyPromo}
                                    disabled={!promoCode.trim()}
                                    className="h-10 px-5 rounded-xl font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-40"
                                >
                                    Apply
                                </Button>
                            </div>
                        )}
                    </div>
                )}

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
                        const isCurrentPlan = currentPlanId === plan.id
                        const showFoundingPrice = isFoundingActive && promoApplied
                        const displayPrice = showFoundingPrice
                            ? (billingCycle === 'annual' ? plan.annualFoundingPrice : plan.foundingPrice)
                            : (billingCycle === 'annual' ? plan.annualPrice : plan.price)
                        const originalPrice = showFoundingPrice
                            ? (billingCycle === 'annual' ? plan.annualPrice : plan.price)
                            : null
                        const period = billingCycle === 'annual' ? '/year' : '/month'

                        return (
                            <div
                                key={plan.id}
                                className={`relative bg-white dark:bg-slate-900 rounded-2xl p-5 border-2 transition-all ${
                                    isCurrentPlan
                                        ? 'border-green-500 dark:border-green-500 shadow-lg shadow-green-500/10'
                                        : plan.popular
                                            ? 'border-blue-500 dark:border-blue-500 shadow-lg shadow-blue-500/10'
                                            : 'border-slate-200 dark:border-slate-800'
                                }`}
                            >
                                {isCurrentPlan ? (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                                        Current Plan
                                    </div>
                                ) : plan.popular && (
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
                                            {originalPrice && (
                                                <span className="text-sm text-slate-400 line-through">{originalPrice}</span>
                                            )}
                                            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{displayPrice}</span>
                                        </div>
                                        <span className="text-xs text-slate-500">{period}</span>
                                        {showFoundingPrice && (
                                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">for first 12 months</p>
                                        )}
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
                                    disabled={!!isPurchasing || isRestoring || isCurrentPlan}
                                    className={`w-full font-bold h-11 rounded-xl ${
                                        isCurrentPlan
                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-not-allowed'
                                            : plan.popular
                                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                                                : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100'
                                    }`}
                                >
                                    {isCurrentPlan ? (
                                        <><Check className="mr-2" size={16} /> Current Plan</>
                                    ) : isCurrentPurchasing ? (
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
