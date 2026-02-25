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
        <div className={`flex flex-col h-full bg-background border-r ${className}`}>
            {/* Header */}
            <div className="p-4 border-b bg-card/50 backdrop-blur-sm">
                <h2 className="font-bold text-lg mb-2">Fleet Command</h2>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/50 p-2 rounded-lg">
                        <div className="text-xs text-muted-foreground">Active Orders</div>
                        <div className="text-xl font-bold text-primary">{activeOrders}</div>
                    </div>
                    <div className="bg-muted/50 p-2 rounded-lg">
                        <div className="text-xs text-muted-foreground">Drivers Online</div>
                        <div className="text-xl font-bold text-green-600">
                            {onlineDrivers}
                            <span className="text-muted-foreground text-sm font-normal">/{drivers.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 p-3 pb-0">
                {([
                    { key: 'all' as DriverFilter, label: 'All', count: drivers.length },
                    { key: 'live' as DriverFilter, label: 'Live', count: onlineDrivers },
                    { key: 'offline' as DriverFilter, label: 'Offline', count: drivers.length - onlineDrivers },
                ]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => onFilterChange(tab.key)}
                        className={cn(
                            "flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                            driverFilter === tab.key
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                    >
                        {tab.label}
                        <span className={cn(
                            "ml-1 text-[10px] px-1 py-0.5 rounded",
                            driverFilter === tab.key ? "bg-primary-foreground/20" : "bg-muted"
                        )}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-3 space-y-2 pb-20">
                    {/* Global View Option */}
                    <Button
                        variant={isGlobalView ? "secondary" : "ghost"}
                        className={cn("w-full justify-start gap-3 h-auto py-3 border border-transparent", isGlobalView && "border-primary/20")}
                        onClick={() => onSelectDrivers(new Set())}
                    >
                        <div className="bg-primary/10 p-2 rounded-full text-primary shrink-0">
                            <Layers size={20} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="font-semibold">Global View</div>
                            <div className="text-xs text-muted-foreground">
                                Show {driverFilter === 'all' ? 'all' : driverFilter} drivers on map
                            </div>
                        </div>
                    </Button>

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
                            <Button
                                key={driver.id}
                                variant={isSelected ? "secondary" : "ghost"}
                                className={cn(
                                    "w-full justify-start gap-3 h-auto py-3 border border-transparent",
                                    isSelected && "border-primary/20"
                                )}
                                onClick={() => toggleDriver(driver.id)}
                            >
                                {/* Selection indicator */}
                                <div className={cn(
                                    "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                    isSelected
                                        ? "bg-primary border-primary text-primary-foreground"
                                        : "border-muted-foreground/30"
                                )}>
                                    {isSelected && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </div>

                                <div className="relative shrink-0">
                                    <div className={cn("p-2 rounded-full", online ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>
                                        <Truck size={18} />
                                    </div>
                                    {online && (
                                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-background rounded-full animate-pulse" />
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
                                    <div className="text-[10px] text-slate-500 mt-1">
                                        {getLastSeenText(driver)}
                                    </div>
                                </div>
                            </Button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
