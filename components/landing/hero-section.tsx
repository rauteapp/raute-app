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
                    <div className="p-3 animate-in fade-in zoom-in-95 duration-300 h-full flex flex-col gap-3 bg-slate-50/50 dark:bg-slate-950/50">
                        {/* Top stat cards - matching real dashboard style */}
                        <div className="grid grid-cols-4 gap-2">
                            {([
                                { label: 'TOTAL', value: '1,248', icon: '📦', color: 'text-slate-800 dark:text-white' },
                                { label: 'ACTIVE', value: '18', icon: '🚛', color: 'text-blue-600 dark:text-blue-400' },
                                { label: 'DONE', value: '1,192', icon: '✓', color: 'text-green-600 dark:text-green-400' },
                                { label: 'ISSUES', value: '3', icon: '⚠', color: 'text-red-600 dark:text-red-400' },
                            ]).map((s) => (
                                <div key={s.label} className="bg-white dark:bg-slate-900 rounded-[14px] border border-slate-100 dark:border-slate-800 p-2.5 hover:shadow-md transition-shadow">
                                    <p className="text-[7px] font-extrabold uppercase tracking-[0.15em] text-slate-400 mb-1">{s.label}</p>
                                    <p className={`text-base font-black tracking-tight leading-none ${s.color}`}>{s.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Fleet Performance section */}
                        <div className="flex-1 bg-white dark:bg-slate-900 rounded-[14px] border border-slate-100 dark:border-slate-800 p-3 flex flex-col min-h-0">
                            <div className="flex items-center justify-between mb-2.5">
                                <p className="text-[10px] font-bold text-slate-900 dark:text-white">Fleet Performance</p>
                                <span className="text-[8px] text-blue-600 dark:text-blue-400 font-semibold">View All</span>
                            </div>
                            <div className="space-y-2 flex-1 overflow-auto">
                                {([
                                    { name: 'Ryan C.', vehicle: 'Ford Transit', stops: '8/10', pct: 80, color: 'from-blue-600 to-indigo-500' },
                                    { name: 'Sarah M.', vehicle: 'Mercedes Sprinter', stops: '12/12', pct: 100, color: 'from-green-500 to-emerald-400' },
                                    { name: 'James L.', vehicle: 'Ram ProMaster', stops: '3/9', pct: 33, color: 'from-amber-500 to-orange-400' },
                                ]).map((d) => (
                                    <div key={d.name} className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                            <Truck size={14} className="text-slate-500 dark:text-slate-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-[10px] font-semibold text-slate-800 dark:text-white truncate">{d.name}</p>
                                                <span className="text-[8px] font-bold text-slate-500 shrink-0">{d.stops} Stops</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full bg-gradient-to-r ${d.color}`} style={{ width: `${d.pct}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recent Activity feed */}
                        <div className="bg-white dark:bg-slate-900 rounded-[14px] border border-slate-100 dark:border-slate-800 p-3">
                            <p className="text-[10px] font-bold text-slate-900 dark:text-white mb-2">Latest Updates</p>
                            <div className="space-y-1.5">
                                {([
                                    { dot: 'bg-green-500', text: 'Ryan C. delivered #ORD-847', time: '2m' },
                                    { dot: 'bg-blue-500', text: 'Sarah M. completed route', time: '8m' },
                                    { dot: 'bg-amber-500', text: 'James L. — traffic delay', time: '15m' },
                                ]).map((a) => (
                                    <div key={a.text} className="flex items-center gap-2 text-[10px]">
                                        <div className={`w-1.5 h-1.5 rounded-full ${a.dot} shrink-0`} />
                                        <span className="text-slate-600 dark:text-slate-300 flex-1 truncate">{a.text}</span>
                                        <span className="text-slate-400 text-[8px] shrink-0">{a.time}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            case 'Drivers':
                return (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col bg-slate-50/50 dark:bg-slate-950/50">
                        {/* Sticky header - matches real app */}
                        <div className="px-3 py-2.5 flex items-center justify-between bg-white/70 dark:bg-slate-950/70 backdrop-blur-2xl border-b border-slate-200/50 dark:border-slate-800/50">
                            <div>
                                <p className="text-[11px] font-black text-slate-900 dark:text-white tracking-tight">Driver Management</p>
                                <p className="text-[8px] font-semibold text-slate-500 mt-0.5">Manage your fleet and assignments.</p>
                            </div>
                            <div className="flex items-center gap-1.5 h-6 rounded-[10px] px-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[8px] font-bold shadow-sm">
                                + Add <span className="text-[7px] opacity-60">5/10</span>
                            </div>
                        </div>

                        {/* Driver cards list */}
                        <div className="flex-1 overflow-auto p-2.5 space-y-2">
                            {([
                                { letter: 'R', name: 'Ryan C.', email: 'ryan@fleet.co', phone: '+1 555-0101', vehicle: 'Ford Transit', status: 'active', activated: true },
                                { letter: 'S', name: 'Sarah M.', email: 'sarah@fleet.co', phone: '+1 555-0102', vehicle: 'Sprinter', status: 'active', activated: true },
                                { letter: 'J', name: 'James L.', email: 'james@fleet.co', phone: '+1 555-0103', vehicle: 'ProMaster', status: 'active', activated: false },
                                { letter: 'M', name: 'Mike R.', email: 'mike@fleet.co', phone: '', vehicle: 'Transit', status: 'active', activated: true },
                                { letter: 'L', name: 'Lisa D.', email: 'lisa@fleet.co', phone: '+1 555-0105', vehicle: '', status: 'suspended', activated: true },
                            ]).map((d) => (
                                <div key={d.letter} className="group relative flex items-center gap-2.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg transition-all rounded-[16px] p-2.5 cursor-pointer">
                                    {/* Left accent */}
                                    <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-blue-500 to-indigo-500 opacity-20 rounded-l-full" />
                                    {/* Avatar */}
                                    <div className="h-9 w-9 rounded-[10px] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 shadow-sm flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700/60 text-blue-600 dark:text-blue-400 font-black text-sm">
                                        {d.letter}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-[10px] font-black text-slate-900 dark:text-white tracking-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{d.name}</p>
                                            <span className={`px-1.5 py-0 text-[6px] font-black tracking-wider uppercase rounded-full border ${d.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>{d.status}</span>
                                            {!d.activated && <span className="px-1.5 py-0 text-[6px] font-black tracking-wider uppercase rounded-full border bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60">Pending</span>}
                                        </div>
                                        <div className="flex gap-2 text-[8px] font-semibold text-slate-400 mt-0.5">
                                            <span className="truncate">{d.email}</span>
                                            {d.vehicle && <span>&bull; {d.vehicle}</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            case 'Orders':
                return (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 h-full flex flex-col bg-slate-50/50 dark:bg-slate-950/50">
                        {/* Sticky header - matches real app */}
                        <div className="px-3 py-2.5 flex items-center justify-between bg-white/70 dark:bg-slate-950/70 backdrop-blur-2xl border-b border-slate-200/50 dark:border-slate-800/50">
                            <div>
                                <p className="text-[11px] font-black text-slate-900 dark:text-white tracking-tight">All Orders</p>
                                <p className="text-[8px] font-semibold text-slate-500 mt-0.5">Manage company deliveries</p>
                            </div>
                            <div className="flex items-center gap-1.5 h-6 rounded-[10px] px-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[8px] font-bold shadow-sm">
                                + Add Order
                            </div>
                        </div>

                        {/* Quick stat cards - matches real app */}
                        <div className="px-2.5 pt-2.5 grid grid-cols-4 gap-1.5">
                            {([
                                { label: 'Total', value: '47', icon: '📦', border: 'border-slate-200 dark:border-slate-800' },
                                { label: 'Pending', value: '4', icon: '⏳', border: 'border-amber-200 dark:border-amber-900/60' },
                                { label: 'Active', value: '12', icon: '🚛', border: 'border-blue-200 dark:border-blue-900/60' },
                                { label: 'Delivered', value: '31', icon: '✓', border: 'border-emerald-200 dark:border-emerald-900/60' },
                            ]).map((s) => (
                                <div key={s.label} className={`bg-white dark:bg-slate-900 rounded-xl border ${s.border} p-1.5 text-center`}>
                                    <p className="text-xs font-black leading-none text-slate-900 dark:text-white">{s.value}</p>
                                    <p className="text-[6px] font-bold text-slate-400 mt-0.5">{s.label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Status filter tabs - matches real app */}
                        <div className="px-2.5 pt-2 flex gap-1 overflow-x-auto">
                            {(['All', 'Pending', 'Assigned', 'In Progress', 'Delivered']).map((tab, i) => (
                                <span key={tab} className={`px-2 py-0.5 text-[7px] font-bold rounded-full border whitespace-nowrap ${i === 0 ? 'bg-[#0f172a] text-white border-[#0f172a] dark:bg-white dark:text-slate-900 dark:border-white shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800'}`}>{tab}</span>
                            ))}
                        </div>

                        {/* Order cards - mobile style from real app */}
                        <div className="flex-1 overflow-auto p-2.5 space-y-2">
                            {([
                                { id: '847', customer: 'Alex P.', address: '123 Oak Ave, Brooklyn', status: 'delivered', statusLabel: 'Delivered', time: '10:30 AM', accent: 'bg-green-500', statusStyle: 'bg-green-50 text-green-700 border-green-200/50 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' },
                                { id: '848', customer: 'Maria S.', address: '456 Main St, Queens', status: 'in_progress', statusLabel: 'In Progress', time: '11:15 AM', accent: 'bg-purple-500', statusStyle: 'bg-purple-50 text-purple-700 border-purple-200/50 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800' },
                                { id: '849', customer: 'Tom H.', address: '789 Elm St, Bronx', status: 'assigned', statusLabel: 'Assigned', time: '12:00 PM', accent: 'bg-blue-500', statusStyle: 'bg-blue-50 text-blue-700 border-blue-200/50 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
                                { id: '850', customer: 'Nina K.', address: '321 2nd Ave, Manhattan', status: 'pending', statusLabel: 'Pending', time: '01:30 PM', accent: 'bg-amber-500', statusStyle: 'bg-yellow-50 text-yellow-700 border-yellow-200/50 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' },
                                { id: '851', customer: 'David L.', address: '654 Park Blvd, Staten Island', status: 'delivered', statusLabel: 'Delivered', time: '09:45 AM', accent: 'bg-green-500', statusStyle: 'bg-green-50 text-green-700 border-green-200/50 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' },
                            ]).map((o) => (
                                <div key={o.id} className="relative bg-white dark:bg-slate-900 rounded-[14px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-800 p-2.5 cursor-pointer hover:shadow-lg transition-all">
                                    {/* Left accent */}
                                    <div className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${o.accent}`} />
                                    {/* Header row */}
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[11px] font-black text-slate-900 dark:text-white tracking-tight">#{o.id}</p>
                                        <span className={`px-1.5 py-0.5 text-[6px] font-black rounded-[6px] uppercase tracking-widest border shadow-sm ${o.statusStyle}`}>{o.statusLabel}</span>
                                    </div>
                                    {/* Details */}
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-semibold text-slate-700 dark:text-slate-300 truncate">{o.customer}</p>
                                            <p className="text-[8px] text-slate-400 truncate mt-0.5">{o.address}</p>
                                        </div>
                                        <span className="text-[8px] font-semibold text-slate-400 shrink-0 ml-2">{o.time}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            case 'Live Map':
            default:
                return (
                    <div className="absolute inset-0 bg-[#e8e4da] dark:bg-[#1a2332]">
                        {/* Realistic Map Background */}
                        <svg className="absolute inset-0 w-full h-full dark:brightness-[0.35] dark:saturate-50 dark:contrast-125" viewBox="0 0 500 380" preserveAspectRatio="xMidYMid slice">
                            {/* Water body */}
                            <ellipse cx="440" cy="60" rx="120" ry="80" fill="#a8d5e2" opacity="0.5" />
                            <ellipse cx="460" cy="50" rx="90" ry="60" fill="#91c8d8" opacity="0.4" />

                            {/* Parks / green areas */}
                            <rect x="30" y="40" width="70" height="50" rx="8" fill="#b8d8a0" opacity="0.7" />
                            <rect x="320" y="260" width="60" height="45" rx="6" fill="#b8d8a0" opacity="0.6" />
                            <circle cx="50" cy="340" r="30" fill="#c4dda8" opacity="0.5" />
                            <rect x="180" y="10" width="40" height="30" rx="4" fill="#b8d8a0" opacity="0.5" />

                            {/* Major roads */}
                            <path d="M 0 150 L 500 130" stroke="#ffffff" strokeWidth="12" fill="none" opacity="0.9" />
                            <path d="M 0 150 L 500 130" stroke="#f0ece3" strokeWidth="10" fill="none" />
                            <path d="M 200 0 L 180 380" stroke="#ffffff" strokeWidth="12" fill="none" opacity="0.9" />
                            <path d="M 200 0 L 180 380" stroke="#f0ece3" strokeWidth="10" fill="none" />
                            <path d="M 0 280 L 500 260" stroke="#ffffff" strokeWidth="10" fill="none" opacity="0.9" />
                            <path d="M 0 280 L 500 260" stroke="#f0ece3" strokeWidth="8" fill="none" />
                            <path d="M 380 0 L 360 380" stroke="#ffffff" strokeWidth="8" fill="none" opacity="0.9" />
                            <path d="M 380 0 L 360 380" stroke="#f0ece3" strokeWidth="6" fill="none" />

                            {/* Secondary roads */}
                            <path d="M 0 80 L 500 70" stroke="#f5f1e8" strokeWidth="5" fill="none" />
                            <path d="M 0 210 L 500 200" stroke="#f5f1e8" strokeWidth="5" fill="none" />
                            <path d="M 0 340 L 500 330" stroke="#f5f1e8" strokeWidth="5" fill="none" />
                            <path d="M 80 0 L 70 380" stroke="#f5f1e8" strokeWidth="5" fill="none" />
                            <path d="M 280 0 L 270 380" stroke="#f5f1e8" strokeWidth="5" fill="none" />
                            <path d="M 450 0 L 440 380" stroke="#f5f1e8" strokeWidth="4" fill="none" />

                            {/* Building blocks */}
                            <rect x="90" y="90" width="80" height="45" rx="3" fill="#d9d3c7" opacity="0.8" />
                            <rect x="95" y="95" width="30" height="18" rx="2" fill="#cec7b8" />
                            <rect x="130" y="95" width="35" height="35" rx="2" fill="#c8c0af" />
                            <rect x="210" y="25" width="55" height="40" rx="3" fill="#d5cfc3" opacity="0.8" />
                            <rect x="215" y="30" width="22" height="15" rx="1" fill="#cac3b4" />
                            <rect x="240" y="30" width="20" height="30" rx="1" fill="#c5bead" />
                            <rect x="210" y="160" width="60" height="35" rx="3" fill="#d9d3c7" opacity="0.8" />
                            <rect x="285" y="80" width="65" height="50" rx="3" fill="#d5cfc3" opacity="0.7" />
                            <rect x="290" y="85" width="25" height="20" rx="2" fill="#cec7b8" />
                            <rect x="320" y="85" width="25" height="40" rx="2" fill="#c8c0af" />
                            <rect x="90" y="165" width="70" height="35" rx="3" fill="#d2ccbf" opacity="0.8" />
                            <rect x="95" y="170" width="28" height="25" rx="2" fill="#c5bead" />
                            <rect x="128" y="170" width="27" height="15" rx="1" fill="#cac3b4" />
                            <rect x="395" y="145" width="50" height="40" rx="3" fill="#d9d3c7" opacity="0.7" />
                            <rect x="285" y="210" width="45" height="35" rx="3" fill="#d5cfc3" opacity="0.7" />
                            <rect x="90" y="290" width="75" height="35" rx="3" fill="#d2ccbf" opacity="0.8" />
                            <rect x="210" y="290" width="50" height="30" rx="3" fill="#d9d3c7" opacity="0.7" />
                            <rect x="390" y="280" width="55" height="40" rx="3" fill="#d5cfc3" opacity="0.7" />
                            <rect x="395" y="210" width="60" height="35" rx="3" fill="#d2ccbf" opacity="0.6" />

                            {/* Road labels (tiny) */}
                            <text x="250" y="127" fontSize="5" fill="#999" fontFamily="sans-serif" opacity="0.7">Main St</text>
                            <text x="172" y="100" fontSize="4.5" fill="#999" fontFamily="sans-serif" opacity="0.6" transform="rotate(-88, 172, 100)">Oak Ave</text>
                            <text x="250" y="257" fontSize="5" fill="#999" fontFamily="sans-serif" opacity="0.6">2nd Ave</text>
                            <text x="352" y="180" fontSize="4.5" fill="#999" fontFamily="sans-serif" opacity="0.6" transform="rotate(-88, 352, 180)">Elm St</text>

                            {/* Delivery stop pins */}
                            <g opacity="0.9">
                                <circle cx="120" cy="150" r="4" fill="#ef4444" stroke="white" strokeWidth="1.5" />
                                <circle cx="270" cy="200" r="4" fill="#ef4444" stroke="white" strokeWidth="1.5" />
                                <circle cx="350" cy="270" r="4" fill="#ef4444" stroke="white" strokeWidth="1.5" />
                                <circle cx="420" cy="300" r="4" fill="#22c55e" stroke="white" strokeWidth="1.5" />
                            </g>

                            {/* Route Line - thicker with glow */}
                            <path d="M 20 180 Q 120 150, 180 195 T 350 270 Q 400 290, 470 310" fill="none" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" opacity="0.3" />
                            <path d="M 20 180 Q 120 150, 180 195 T 350 270 Q 400 290, 470 310" fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeDasharray="0" />

                            {/* Completed stops checkmarks */}
                            <circle cx="250" cy="250" r="6" fill="#3b82f6" stroke="white" strokeWidth="2" />

                            {/* Animated Truck - moves along route inside SVG */}
                            <g>
                                <circle r="8" fill="#1e293b" stroke="white" strokeWidth="2.5">
                                    <animateMotion dur="6s" repeatCount="indefinite" path="M 20 180 Q 120 150, 180 195 T 350 270 Q 400 290, 470 310" />
                                </circle>
                                {/* Truck icon inside circle */}
                                <g fill="white" transform="translate(-5,-5) scale(0.4)">
                                    <animateMotion dur="6s" repeatCount="indefinite" path="M 20 180 Q 120 150, 180 195 T 350 270 Q 400 290, 470 310" />
                                    <path d="M5 17h2a2 2 0 0 0 4 0h2a2 2 0 0 0 4 0h3V6a2 2 0 0 0-2-2H2v11h1a2 2 0 0 0 2 2zm10-7V6h4l3 4h-7zM7 17a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm8 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
                                </g>
                                {/* Ping effect */}
                                <circle r="8" fill="#3b82f6" opacity="0.3">
                                    <animateMotion dur="6s" repeatCount="indefinite" path="M 20 180 Q 120 150, 180 195 T 350 270 Q 400 290, 470 310" />
                                    <animate attributeName="r" values="8;16;8" dur="1.5s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.3;0;0.3" dur="1.5s" repeatCount="indefinite" />
                                </circle>
                            </g>
                        </svg>

                        {/* Driver Card Overlay */}
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute top-3 right-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 w-44 z-20"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">RC</div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-800 dark:text-white">Ryan C.</p>
                                    <p className="text-[9px] text-slate-500">Ford Transit • Active</p>
                                </div>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full w-2/3 bg-blue-500 rounded-full" />
                            </div>
                            <div className="flex justify-between mt-1.5 text-[9px] text-slate-400">
                                <span>ETA: 10:45 AM</span>
                                <span>3/6 stops</span>
                            </div>
                        </motion.div>

                        {/* Map controls (zoom) */}
                        <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-20">
                            <div className="w-7 h-7 bg-white/90 dark:bg-slate-800/90 rounded shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 text-xs font-bold">+</div>
                            <div className="w-7 h-7 bg-white/90 dark:bg-slate-800/90 rounded shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 text-xs font-bold">&minus;</div>
                        </div>

                        {/* Legend */}
                        <div className="absolute bottom-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm px-2 py-1.5 rounded shadow-sm border border-slate-200 dark:border-slate-700 z-20 flex items-center gap-3">
                            <span className="flex items-center gap-1 text-[8px] text-slate-500"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Pending</span>
                            <span className="flex items-center gap-1 text-[8px] text-slate-500"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Done</span>
                            <span className="flex items-center gap-1 text-[8px] text-slate-500"><span className="w-1.5 h-0.5 bg-blue-500 inline-block rounded" /> Route</span>
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
                                    <Sparkles size={14} /> Founding Member — 50% OFF (Website Only)
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
