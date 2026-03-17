'use client'

import { ArrowRight, CheckCircle2, Play, Truck, LayoutDashboard, Map, Users, Package, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function HeroSection() {
    const [activeTab, setActiveTab] = useState('Live Map')
    const [foundingActive, setFoundingActive] = useState(false)

    useEffect(() => {
        supabase.from('app_config').select('value').eq('key', 'founding_members').single()
            .then(({ data }) => {
                if (data?.value) {
                    const v = data.value as any
                    setFoundingActive(v.active && v.count < v.limit)
                }
            })
    }, [])

    const renderContent = () => {
        switch (activeTab) {
            case 'Dashboard':
                return (
                    <div className="p-6 space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                                <p className="text-xs text-slate-500 mb-1">Completed Orders</p>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">1,248</p>
                                <div className="mt-2 h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full w-[92%] bg-green-500 rounded-full" />
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                                <p className="text-xs text-slate-500 mb-1">Pending Orders</p>
                                <p className="text-xl font-bold text-slate-900 dark:text-white">12</p>
                                <div className="mt-2 h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full w-[15%] bg-amber-500 rounded-full" />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 flex flex-col gap-3">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Driver Activity</p>
                            {[1, 2].map((i) => (
                                <div key={i} className="flex items-center gap-3 text-sm">
                                    <div className={`w-2 h-2 rounded-full ${i === 1 ? 'bg-green-500' : 'bg-blue-500'}`} />
                                    <span className="text-slate-700 dark:text-slate-300 flex-1">
                                        {i === 1 ? 'Driver #4 completed delivery' : 'Driver #7 started route'}
                                    </span>
                                    <span className="text-slate-400 text-xs">{i === 1 ? '2m ago' : '15m ago'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            case 'Drivers':
                return (
                    <div className="p-4 space-y-3 animate-in fade-in slide-in-from-right-4 duration-300">
                        {([
                            { initials: 'AK', name: 'Ahmed K.', route: 'Route 101', status: 'On Time', color: 'bg-green-500' },
                            { initials: 'SM', name: 'Sarah M.', route: 'Route 102', status: 'On Time', color: 'bg-green-500' },
                            { initials: 'JL', name: 'James L.', route: 'Route 103', status: 'Delayed', color: 'bg-amber-500' },
                        ]).map((driver) => (
                            <div key={driver.initials} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500">
                                    {driver.initials}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{driver.name}</p>
                                    <p className="text-[10px] text-slate-500">{driver.route} • {driver.status}</p>
                                </div>
                                <div className={`w-2 h-2 rounded-full ${driver.color}`} />
                            </div>
                        ))}
                    </div>
                )
            case 'Orders':
                return (
                    <div className="p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="space-y-2">
                            {([
                                { id: '#ORD-001', status: 'Delivered', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400' },
                                { id: '#ORD-002', status: 'In Transit', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400' },
                                { id: '#ORD-003', status: 'Processing', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400' },
                                { id: '#ORD-004', status: 'Pending', bg: 'bg-slate-100 dark:bg-slate-700/50', text: 'text-slate-500 dark:text-slate-400' },
                            ]).map((order) => (
                                <div key={order.id} className="flex items-center justify-between p-2 text-sm border-b border-slate-100 dark:border-slate-700 pb-2">
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{order.id}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${order.bg} ${order.text}`}>{order.status}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            case 'Live Map':
            default:
                return (
                    <div className="absolute inset-0">
                        {/* Map Grid/Pattern */}
                        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                        <div className="absolute inset-0">
                            {/* Streets */}
                            <div className="absolute top-[20%] left-0 right-0 h-4 bg-white dark:bg-slate-700 shadow-sm transform -skew-y-3" />
                            <div className="absolute top-0 bottom-0 left-[40%] w-4 bg-white dark:bg-slate-700 shadow-sm transform skew-x-6" />

                            {/* Route Line */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-lg">
                                <path d="M -20 180 Q 150 160, 250 250 T 500 300" fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
                                <circle cx="250" cy="250" r="6" fill="#3b82f6" stroke="white" strokeWidth="2" />
                            </svg>

                            {/* Driver Card Overlay - Moved Down */}
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="absolute top-20 right-4 bg-white dark:bg-slate-900 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 w-48 z-20"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">JD</div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-800 dark:text-white">John Doe</p>
                                        <p className="text-[10px] text-slate-500">Ford Transit • Active</p>
                                    </div>
                                </div>
                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full w-2/3 bg-blue-500 rounded-full" />
                                </div>
                                <div className="flex justify-between mt-2 text-[10px] text-slate-400">
                                    <span>ETA: 10:45 AM</span>
                                    <span>6 stops left</span>
                                </div>
                            </motion.div>

                            {/* Animated Driver */}
                            <motion.div
                                className="absolute"
                                animate={{ x: [20, 250], y: [180, 250] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                            >
                                <div className="relative -ml-3 -mt-3">
                                    <div className="w-6 h-6 bg-slate-900 border-2 border-white rounded-full flex items-center justify-center shadow-xl z-10 relative">
                                        <Truck size={12} className="text-white" />
                                    </div>
                                    <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
                                </div>
                            </motion.div>
                        </div>
                    </div>
                )
        }
    }

    return (
        <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-white dark:bg-slate-950">
            {/* Background Decor */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-400/20 dark:bg-blue-900/20 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-400/20 dark:bg-indigo-900/20 rounded-full blur-[100px]" />
                {/* Grid Pattern */}
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-[0.03] dark:opacity-[0.05]" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
                <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

                    {/* Text Content */}
                    <div className="flex-1 text-center lg:text-left space-y-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                        >
                            {foundingActive ? (
                                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold mb-6 shadow-lg shadow-blue-500/20 animate-pulse">
                                    <Sparkles size={14} /> Founding Member Offer — 50% OFF
                                </span>
                            ) : (
                                <span className="inline-block px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-bold mb-6 border border-blue-100 dark:border-blue-800">
                                    The Future of Fleet Management
                                </span>
                            )}
                            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
                                Master Your <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                                    Last Mile
                                </span>
                            </h1>
                            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto lg:mx-0 leading-relaxed mt-6 mb-8">
                                The all-in-one platform to plan routes, track drivers, and delight customers.
                                Stop wrestling with spreadsheets and start scaling.
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
                        >
                            <Link href="/signup" className="w-full sm:w-auto">
                                <Button size="lg" className="w-full h-12 rounded-full text-base font-semibold px-8 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 hover:-translate-y-1 transition-all duration-300">
                                    Start for Free <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                            <Link href="#how-it-works" className="w-full sm:w-auto">
                                <Button variant="ghost" size="lg" className="w-full h-12 rounded-full text-base font-medium px-8 text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-300 dark:hover:bg-slate-900">
                                    <Play className="mr-2 h-4 w-4 fill-current" /> How it Works
                                </Button>
                            </Link>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.4 }}
                            className="pt-4 flex items-center justify-center lg:justify-start gap-6 text-sm font-medium text-slate-500 dark:text-slate-500"
                        >
                            <span className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-green-500" /> No credit card needed</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-green-500" /> 7-day free trial</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-green-500" /> Setup in 5 min</span>
                        </motion.div>
                    </div>

                    {/* Hero Visual */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.7, delay: 0.2 }}
                        className="flex-1 relative w-full max-w-[650px] lg:max-w-none mx-auto lg:mr-0 mt-8 lg:mt-0"
                    >
                        {/* Decorative Blob Behind Image */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-blue-100/50 dark:bg-blue-900/10 rounded-full blur-3xl -z-10" />

                        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
                            {/* Browser/App Window Header */}
                            <div className="h-10 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                <div className="w-3 h-3 rounded-full bg-amber-400" />
                                <div className="w-3 h-3 rounded-full bg-green-400" />
                                <div className="ml-4 flex-1 max-w-[200px] h-6 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 flex items-center px-2 text-[10px] text-slate-400">
                                    app.raute.io/dashboard
                                </div>
                            </div>

                            {/* App Content */}
                            <div className="flex-1 flex overflow-hidden">
                                {/* Sidebar */}
                                <div className="w-16 sm:w-48 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col py-4 z-20">
                                    <div className="px-4 mb-6 flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">R</div>
                                        <span className="font-bold text-slate-900 dark:text-white hidden sm:block">Raute</span>
                                    </div>
                                    <div className="space-y-1 px-2">
                                        {([
                                            { name: 'Dashboard', icon: LayoutDashboard },
                                            { name: 'Live Map', icon: Map },
                                            { name: 'Drivers', icon: Users },
                                            { name: 'Orders', icon: Package },
                                        ] as const).map(({ name, icon: Icon }) => (
                                            <div
                                                key={name}
                                                onClick={() => setActiveTab(name)}
                                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${activeTab === name ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                            >
                                                <Icon size={18} className={activeTab === name ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'} />
                                                <span className="hidden sm:block">{name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Main Content Area */}
                                <div className="flex-1 bg-slate-100 dark:bg-slate-800 relative z-0 overflow-hidden">
                                    {renderContent()}
                                </div>
                            </div>
                        </div>

                        {/* Floating Badge 1: Active Fleet */}
                        <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute -bottom-6 -left-0 sm:-left-6 lg:-left-12 bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 flex items-center gap-3 z-30 max-w-[200px]"
                        >
                            <div className="h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 shrink-0">
                                <Truck size={20} />
                            </div>
                            <div>
                                <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wide">Active Fleet</p>
                                <p className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white">12 Drivers</p>
                            </div>
                        </motion.div>

                        {/* Floating Badge 2: Efficiency */}
                        <motion.div
                            animate={{ y: [0, 10, 0] }}
                            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                            className="absolute -top-6 -right-0 sm:-right-4 lg:-right-8 bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 flex items-center gap-3 z-30 max-w-[200px]"
                        >
                            <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                                <Play size={20} className="fill-current" />
                            </div>
                            <div>
                                <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wide">Efficiency</p>
                                <p className="text-sm sm:text-md font-bold text-green-600">+24% Boost</p>
                            </div>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </section>
    )
}
