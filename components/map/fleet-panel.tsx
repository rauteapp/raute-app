"use client"

import { Truck, Layers, CheckCircle2, AlertCircle, MapPinOff, Radio, WifiOff } from "lucide-react"
import type { Driver } from "@/lib/supabase"
import { isDriverOnline, getLastSeenText } from "@/lib/driver-status"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type DriverFilter = 'all' | 'live' | 'offline'

interface FleetPanelProps {
    drivers: Driver[]
    orders: any[]
    selectedDriverIds: Set<string>
    onSelectDrivers: (ids: Set<string>) => void
    driverFilter: DriverFilter
    onFilterChange: (filter: DriverFilter) => void
    className?: string
}

export function FleetPanel({ drivers, orders, selectedDriverIds, onSelectDrivers, driverFilter, onFilterChange, className }: FleetPanelProps) {
    // Stats
    const activeOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length
    const onlineDrivers = drivers.filter(d => isDriverOnline(d)).length

    // Filter drivers based on current tab
    const filteredDrivers = drivers.filter(d => {
        if (driverFilter === 'live') return isDriverOnline(d)
        if (driverFilter === 'offline') return !isDriverOnline(d)
        return true
    })

    // Helper to get stats for a driver
    const getDriverStats = (driverId: string) => {
        const driverOrders = orders.filter(o => o.driver_id === driverId)
        const active = driverOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length
        const completed = driverOrders.filter(o => o.status === 'delivered').length
        const missingGps = driverOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled' && (!o.latitude || !o.longitude)).length
        return { active, completed, missingGps }
    }

    const toggleDriver = (driverId: string) => {
        const next = new Set(selectedDriverIds)
        if (next.has(driverId)) {
            next.delete(driverId)
        } else {
            next.add(driverId)
        }
        onSelectDrivers(next)
    }

    const isGlobalView = selectedDriverIds.size === 0

    return (
        <div className={`flex flex-col h-full bg-transparent ${className}`}>
            {/* Header */}
            <div className="p-5 border-b border-slate-200/50 dark:border-slate-800/50 flex-shrink-0">
                <h2 className="font-black text-xl mb-4 tracking-tight text-slate-900 dark:text-white">Fleet Command</h2>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/50 dark:bg-slate-900/50 p-4 rounded-[20px] border border-slate-200/60 dark:border-slate-800 shadow-sm">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Active Orders</div>
                        <div className="text-2xl font-black text-primary tracking-tight">{activeOrders}</div>
                    </div>
                    <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-[20px] border border-emerald-200/60 dark:border-emerald-900/40 shadow-sm">
                        <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-1">Drivers Online</div>
                        <div className="text-2xl font-black text-emerald-600 tracking-tight">
                            {onlineDrivers}
                            <span className="text-emerald-500/50 text-base font-bold ml-1">/{drivers.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 p-1.5 mx-4 mt-4 bg-slate-100/50 dark:bg-slate-800/50 rounded-[20px]">
                {([
                    { key: 'all' as DriverFilter, label: 'All', count: drivers.length },
                    { key: 'live' as DriverFilter, label: 'Live', count: onlineDrivers },
                    { key: 'offline' as DriverFilter, label: 'Offline', count: drivers.length - onlineDrivers },
                ]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => onFilterChange(tab.key)}
                        className={cn(
                            "flex-1 px-3 py-2 rounded-[16px] text-[13px] font-bold transition-all",
                            driverFilter === tab.key
                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm scale-[1.02]"
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-700/50"
                        )}
                    >
                        {tab.label}
                        <span className={cn(
                            "ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full",
                            driverFilter === tab.key ? "bg-slate-100 dark:bg-slate-800" : "bg-slate-200 dark:bg-slate-700"
                        )}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar mt-2">
                <div className="p-4 space-y-3 pb-36">
                    {/* Global View Option */}
                    <button
                        className={cn("w-full flex items-center gap-4 p-3 rounded-[20px] transition-all border", isGlobalView ? "bg-primary/5 dark:bg-primary/10 border-primary/20 shadow-sm" : "bg-white/40 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 hover:bg-white/60 dark:hover:bg-slate-800/60")}
                        onClick={() => onSelectDrivers(new Set())}
                    >
                        <div className="bg-primary/10 dark:bg-primary/20 p-2.5 rounded-full text-primary shrink-0">
                            <Layers size={18} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="font-bold text-[14px]">Global View</div>
                            <div className="text-[12px] text-slate-500 font-semibold">
                                Show {driverFilter === 'all' ? 'all' : driverFilter} drivers on map
                            </div>
                        </div>
                    </button>

                    <div className="pt-2 pb-1 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                        <span>Drivers</span>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                            {filteredDrivers.length}
                        </span>
                    </div>

                    {filteredDrivers.length === 0 && (
                        <div className="text-center py-6 text-sm text-muted-foreground">
                            {driverFilter === 'live' ? 'No drivers online' : 'No offline drivers'}
                        </div>
                    )}

                    {filteredDrivers.map(driver => {
                        const stats = getDriverStats(driver.id)
                        const isSelected = selectedDriverIds.has(driver.id)
                        const online = isDriverOnline(driver)

                        return (
                            <button
                                key={driver.id}
                                className={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-[20px] transition-all border",
                                    isSelected
                                        ? "bg-blue-50/50 dark:bg-blue-900/10 border-blue-200/60 dark:border-blue-800/30 shadow-sm scale-[1.01]"
                                        : "bg-white/40 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700"
                                )}
                                onClick={() => toggleDriver(driver.id)}
                            >
                                {/* Selection indicator */}
                                <div className={cn(
                                    "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                                    isSelected
                                        ? "bg-blue-600 border-blue-600 text-white"
                                        : "border-slate-300 dark:border-slate-600"
                                )}>
                                    {isSelected && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </div>

                                <div className="relative shrink-0">
                                    <div className={cn("p-2.5 rounded-full", online ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400")}>
                                        <Truck size={18} />
                                    </div>
                                    {online && (
                                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                                    )}
                                </div>

                                <div className="flex-1 text-left overflow-hidden min-w-0">
                                    <div className="font-semibold truncate flex items-center gap-2">
                                        {driver.name}
                                        {online && driver.current_lat && driver.current_lng && (
                                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-normal flex items-center gap-0.5">
                                                <Radio size={8} /> Live
                                            </span>
                                        )}
                                        {!online && driver.current_lat && driver.current_lng && (
                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-normal flex items-center gap-0.5">
                                                <WifiOff size={8} /> Last seen
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                                        {stats.active > 0 ? (
                                            <span className="text-blue-600 font-medium flex items-center gap-1">
                                                <AlertCircle size={10} />
                                                {stats.active} Active
                                            </span>
                                        ) : (
                                            <span className="opacity-70">No active</span>
                                        )}
                                        {stats.missingGps > 0 && (
                                            <>
                                                <span className="text-slate-300">•</span>
                                                <span className="text-orange-600 font-bold flex items-center gap-1 bg-orange-50 px-1 rounded-sm">
                                                    <MapPinOff size={10} />
                                                    {stats.missingGps} No GPS
                                                </span>
                                            </>
                                        )}
                                        <span className="text-slate-300">•</span>
                                        <span className="text-green-600/80 flex items-center gap-1">
                                            <CheckCircle2 size={10} />
                                            {stats.completed} Done
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold mt-1">
                                        {getLastSeenText(driver)}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
