'use client'

import { useEffect, useState } from 'react'
import { Check, Flame, Zap, Copy, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type BillingCycle = 'monthly' | 'annual'

const plans = {
    starter: {
        name: 'Starter',
        monthly: 24.99,
        annual: 249.90,
        foundingMonthly: 12.50,
        foundingAnnual: 124.95,
        features: [
            { text: 'Up to 5 Drivers', color: 'text-green-500' },
            { text: 'Up to 500 Orders/mo', color: 'text-green-500' },
            { text: 'All Core Features', color: 'text-green-500' },
            { text: 'Email Support', color: 'text-green-500' },
        ],
    },
    pro: {
        name: 'Pro',
        monthly: 59.99,
        annual: 599.90,
        foundingMonthly: 30,
        foundingAnnual: 299.95,
        features: [
            { text: 'Up to 15 Drivers', color: 'text-blue-500' },
            { text: 'Up to 2,000 Orders/mo', color: 'text-green-500' },
            { text: 'All Core Features', color: 'text-green-500' },
            { text: 'Priority Email Support', color: 'text-green-500' },
        ],
    },
    pioneer: {
        name: 'Pioneer',
        monthly: 99.99,
        annual: 999.90,
        foundingMonthly: 50,
        foundingAnnual: 499.95,
        features: [
            { text: 'Up to 40 Drivers', color: 'text-purple-500' },
            { text: 'Up to 10,000 Orders/mo', color: 'text-green-500' },
            { text: 'All Core Features', color: 'text-green-500' },
            { text: 'Dedicated Support', color: 'text-green-500' },
        ],
    },
}

export function PricingSection() {
    const [foundingMember, setFoundingMember] = useState<{ count: number; limit: number; active: boolean } | null>(null)
    const [billing, setBilling] = useState<BillingCycle>('monthly')

    useEffect(() => {
        supabase.from('app_config').select('value').eq('key', 'founding_members').single()
            .then(({ data }) => { if (data?.value) setFoundingMember(data.value as any) })
    }, [])

    const isFoundingActive = foundingMember?.active && (foundingMember.count < foundingMember.limit)
    const spotsRemaining = foundingMember ? foundingMember.limit - foundingMember.count : 500
    const spotsTaken = foundingMember ? foundingMember.count : 0
    const spotsTotal = foundingMember?.limit ?? 500
    const percentTaken = Math.round((spotsTaken / spotsTotal) * 100)

    const [copied, setCopied] = useState(false)
    const copyCode = () => {
        navigator.clipboard.writeText('FOUNDER50')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const getPrice = (plan: typeof plans.starter) => {
        return billing === 'annual' ? plan.annual : plan.monthly
    }
    const getFoundingPrice = (plan: typeof plans.starter) => {
        return billing === 'annual' ? plan.foundingAnnual : plan.foundingMonthly
    }
    const getAnnualSavings = (plan: typeof plans.starter) => {
        return Math.round((1 - plan.annual / (plan.monthly * 12)) * 100)
    }

    return (
        <section id="pricing" className="py-24 bg-white dark:bg-slate-950 relative overflow-hidden">
            {/* Background blobs */}
            <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] bg-blue-50 dark:bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[20%] right-[-10%] w-[500px] h-[500px] bg-purple-50 dark:bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
                <div className="text-center max-w-3xl mx-auto mb-8">
                    <h2 className="text-blue-600 dark:text-blue-400 font-semibold tracking-wide uppercase text-sm mb-3">Simple Pricing</h2>
                    <h3 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                        Transparent plans for every stage
                    </h3>
                    <p className="text-lg text-slate-600 dark:text-slate-400">
                        Start with a 7-day free trial. Upgrade as you grow. No hidden fees.
                    </p>
                </div>

                {/* Billing Toggle */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    <span className={`text-sm font-medium transition-colors ${billing === 'monthly' ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>Monthly</span>
                    <button
                        onClick={() => setBilling(billing === 'monthly' ? 'annual' : 'monthly')}
                        className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${billing === 'annual' ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                    >
                        <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200 ${billing === 'annual' ? 'translate-x-7' : 'translate-x-0.5'}`} />
                    </button>
                    <span className={`text-sm font-medium transition-colors ${billing === 'annual' ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>Annual</span>
                    {billing === 'annual' && (
                        <span className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                            Save ~17%
                        </span>
                    )}
                </div>

                {/* Founding Member Banner */}
                {isFoundingActive && (
                    <div className="max-w-2xl mx-auto mb-12">
                        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-6 text-center text-white shadow-xl shadow-blue-500/25 relative overflow-hidden">
                            {/* Subtle animated shimmer */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer pointer-events-none" />

                            <div className="relative">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
                                    </span>
                                    <p className="text-sm font-bold uppercase tracking-widest">Limited Founding Member Offer</p>
                                </div>
                                <p className="text-2xl sm:text-3xl font-extrabold mb-1">50% OFF for 12 Months</p>
                                <p className="text-sm text-blue-200 mb-3">Exclusive to website signups — not available in-app</p>

                                {/* Progress bar for scarcity */}
                                <div className="max-w-xs mx-auto mb-3">
                                    <div className="flex justify-between text-xs text-blue-200 mb-1">
                                        <span>{spotsTaken} claimed</span>
                                        <span>{spotsRemaining} left</span>
                                    </div>
                                    <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-gradient-to-r from-green-400 to-emerald-300 h-2 rounded-full transition-all duration-500"
                                            style={{ width: `${Math.max(percentTaken, 2)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-blue-200 mt-1">First {spotsTotal} subscribers from the website get 50% off</p>
                                </div>

                                <button
                                    onClick={copyCode}
                                    className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-5 py-2.5 rounded-full border border-white/20 hover:bg-white/25 transition-colors cursor-pointer group"
                                >
                                    <span className="text-sm text-blue-100">Use code</span>
                                    <span className="font-bold text-white bg-white/25 px-3 py-1 rounded font-mono tracking-widest text-base">FOUNDER50</span>
                                    {copied ? (
                                        <CheckCheck size={16} className="text-green-300" />
                                    ) : (
                                        <Copy size={16} className="text-blue-200 group-hover:text-white transition-colors" />
                                    )}
                                    <span className="text-xs text-blue-200">{copied ? 'Copied!' : 'Click to copy'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 items-start">

                    {/* STARTER */}
                    <PlanCard
                        plan={plans.starter}
                        billing={billing}
                        isFoundingActive={!!isFoundingActive}
                        getPrice={getPrice}
                        getFoundingPrice={getFoundingPrice}
                        getAnnualSavings={getAnnualSavings}
                        variant="default"
                        priceColor="text-slate-900 dark:text-white"
                        hoverBorder="hover:border-blue-300 dark:hover:border-blue-700"
                        copyCode={copyCode}
                        copied={copied}
                    />

                    {/* PRO */}
                    <PlanCard
                        plan={plans.pro}
                        billing={billing}
                        isFoundingActive={!!isFoundingActive}
                        getPrice={getPrice}
                        getFoundingPrice={getFoundingPrice}
                        getAnnualSavings={getAnnualSavings}
                        variant="popular"
                        priceColor="text-blue-600 dark:text-blue-400"
                        hoverBorder=""
                        copyCode={copyCode}
                        copied={copied}
                    />

                    {/* PIONEER */}
                    <PlanCard
                        plan={plans.pioneer}
                        billing={billing}
                        isFoundingActive={!!isFoundingActive}
                        getPrice={getPrice}
                        getFoundingPrice={getFoundingPrice}
                        getAnnualSavings={getAnnualSavings}
                        variant="default"
                        priceColor="text-slate-900 dark:text-white"
                        hoverBorder="hover:border-purple-300 dark:hover:border-purple-700"
                        buttonStyle="bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100"
                        copyCode={copyCode}
                        copied={copied}
                    />

                    {/* ENTERPRISE */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md transition-all duration-200 opacity-90">
                        <div className="text-center mb-6 pt-2">
                            <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Enterprise</h4>
                            <div className="text-4xl font-extrabold text-slate-900 dark:text-white mb-1">Custom</div>
                            <span className="text-sm text-slate-500">Contact Sales</span>
                        </div>
                        <ul className="space-y-3 mb-8">
                            {['Unlimited Drivers', 'Unlimited Orders', 'White Labeling', 'Custom API Access'].map((f) => (
                                <li key={f} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                                    <Check size={18} className="text-slate-400 shrink-0" /> {f}
                                </li>
                            ))}
                        </ul>
                        <Link href="#contact">
                            <Button variant="ghost" className="w-full rounded-full h-11 font-semibold hover:text-blue-600">
                                Contact Us
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Feature comparison note */}
                <div className="text-center mt-12 space-y-2">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        All plans include a 7-day free trial. Route Optimization, Real-time GPS Tracking, AI Order Parsing,
                        AI Address Cleaning, Proof of Delivery, Push Notifications, Drag &amp; Drop Planner, and Offline Mode.
                    </p>
                    {isFoundingActive && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            Founding member pricing is exclusive to website signups. In-app subscriptions are at full price.
                        </p>
                    )}
                </div>
            </div>
        </section>
    )
}

/* Plan Card Sub-Component */
function PlanCard({
    plan,
    billing,
    isFoundingActive,
    getPrice,
    getFoundingPrice,
    getAnnualSavings,
    variant,
    priceColor,
    hoverBorder,
    buttonStyle,
    copyCode,
    copied,
}: {
    plan: typeof plans.starter
    billing: BillingCycle
    isFoundingActive: boolean
    getPrice: (p: typeof plans.starter) => number
    getFoundingPrice: (p: typeof plans.starter) => number
    getAnnualSavings: (p: typeof plans.starter) => number
    variant: 'default' | 'popular'
    priceColor: string
    hoverBorder: string
    buttonStyle?: string
    copyCode: () => void
    copied: boolean
}) {
    const price = getPrice(plan)
    const foundingPrice = getFoundingPrice(plan)
    const isPopular = variant === 'popular'
    const periodLabel = billing === 'annual' ? 'per year' : 'per month'

    const formatPrice = (p: number) => {
        if (Number.isInteger(p)) return `$${p}`
        return `$${p.toFixed(2)}`
    }

    return (
        <div className={`${isPopular
            ? 'relative bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/30 dark:to-slate-950 rounded-2xl p-6 border-2 border-blue-200 dark:border-blue-800 shadow-xl lg:scale-105 z-10'
            : `bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm ${hoverBorder} hover:shadow-md transition-all duration-200`
        }`}>
            {isPopular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
                    <Flame size={12} /> Most Popular
                </div>
            )}
            <div className={`text-center mb-6 ${isPopular ? 'pt-4' : 'pt-2'}`}>
                <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{plan.name}</h4>
                {isFoundingActive ? (
                    <>
                        <div className="inline-block bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold px-2.5 py-1 rounded-full mb-2">
                            SAVE 50%
                        </div>
                        <div className="flex items-center justify-center gap-2 mb-1">
                            <span className="text-lg text-slate-400 line-through">{formatPrice(price)}</span>
                            <span className={`text-4xl font-extrabold ${priceColor}`}>{formatPrice(foundingPrice)}</span>
                        </div>
                        <span className="text-sm text-slate-500">{periodLabel}</span>
                    </>
                ) : (
                    <>
                        <span className={`text-4xl font-extrabold ${priceColor}`}>{formatPrice(price)}</span>
                        <p className="text-sm text-slate-500">{periodLabel}</p>
                        {billing === 'annual' && (
                            <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
                                Save {getAnnualSavings(plan)}% vs monthly
                            </p>
                        )}
                    </>
                )}
            </div>
            <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                    <li key={f.text} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                        <Check size={18} className={`${f.color} shrink-0`} /> {f.text}
                    </li>
                ))}
            </ul>
            <Link href="/signup">
                {isPopular ? (
                    <Button className="w-full rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 shadow-lg shadow-blue-500/20">
                        {isFoundingActive ? (
                            <span className="flex items-center gap-1.5"><Zap size={16} /> Claim Founding Price</span>
                        ) : 'Start Free Trial'}
                    </Button>
                ) : (
                    <Button className={`w-full rounded-full h-11 font-bold ${buttonStyle || 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                        {isFoundingActive ? 'Claim Founding Price' : 'Start Free Trial'}
                    </Button>
                )}
            </Link>
        </div>
    )
}
