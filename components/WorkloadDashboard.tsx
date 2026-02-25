'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkloadHistory, type WorkloadData } from '@/lib/workload-calculator'
import { TrendingUp, TrendingDown, RefreshCw, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function WorkloadDashboard() {
    const [workloadData, setWorkloadData] = useState<WorkloadData[]>([])
    const [teamAverage, setTeamAverage] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [isCollapsed, setIsCollapsed] = useState(false)

    useEffect(() => {
        fetchWorkload()
    }, [])

    async function fetchWorkload() {
        setIsLoading(true)
        try {
            // getSession() can hang on web due to navigator.locks — add timeout + fallback
            let userId: string | undefined

            try {
                const { data: { session } } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('getSession timeout')), 3000)
                    ),
                ])
                userId = session?.user?.id
            } catch {
                // Fallback to getUser()
                try {
                    const { data: userData } = await supabase.auth.getUser()
                    userId = userData.user?.id
                } catch {}
            }

            if (!userId) return

            const { data: user } = await supabase
                .from('users')
                .select('company_id')
                .eq('id', userId)
                .single()

            if (!user) return

            const data = await getWorkloadHistory(user.company_id, 7)
            setWorkloadData(data)

            // Calculate team average (Total orders over 7 days per driver)
            const totalOrders = data.reduce((sum, d) => sum + d.total, 0)
            const avg = data.length > 0 ? totalOrders / data.length : 0
            setTeamAverage(avg)
        } catch (error) {
            console.error('Failed to fetch workload:', error)
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoading) {
        return (
            <div className="p-4 bg-muted/30 rounded-lg animate-pulse mb-4">
                <div className="flex justify-between mb-3">
                    <div className="h-4 w-32 bg-muted rounded"></div>
                </div>
                <div className="space-y-2">
                    <div className="h-10 bg-muted rounded"></div>
                    <div className="h-10 bg-muted rounded"></div>
                </div>
            </div>
        )
    }

    if (workloadData.length === 0) return null

    return (
        <div className="border-b border-border bg-card mb-0">
            <div className="p-4 pb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
                    <BarChart3 size={14} />
                    Workload (7 Days)
                </h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        {isCollapsed ? 'Show' : 'Hide'}
                    </button>
                    <button
                        onClick={fetchWorkload}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Refresh Data"
                    >
                        <RefreshCw size={12} />
                    </button>
                </div>
            </div>

            {!isCollapsed && (
                <div className="px-4 pb-4 space-y-3">
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {workloadData.map(driver => {
                            const isBelowAverage = driver.total < teamAverage * 0.8 // < 80% of average
                            const isAboveAverage = driver.total > teamAverage * 1.2 // > 120% of average

                            return (
                                <div key={driver.driverId} className="p-2.5 bg-muted/30 rounded-lg border border-border/50">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-medium text-xs truncate max-w-[120px]" title={driver.driverName}>
                                            {driver.driverName}
                                        </span>
                                        <div className="flex items-center gap-2 text-[10px]">
                                            <span className="font-bold">{driver.total}</span>
                                            <span className="text-muted-foreground">total</span>
                                        </div>
                                    </div>

                                    {/* Status Indicators */}
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] text-muted-foreground">
                                            {driver.average} / day
                                        </div>
                                        {isBelowAverage && (
                                            <div className="flex items-center gap-1 text-orange-600 bg-orange-50 px-1 py-0.5 rounded">
                                                <TrendingDown size={10} />
                                                <span className="text-[9px] font-medium">Low Load</span>
                                            </div>
                                        )}
                                        {isAboveAverage && (
                                            <div className="flex items-center gap-1 text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                                                <TrendingUp size={10} />
                                                <span className="text-[9px] font-medium">High Load</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Mini Bar Chart */}
                                    <div className="flex gap-0.5 h-8 items-end">
                                        {driver.dailyCounts.map((day, idx) => {
                                            // Find global max for scaling
                                            const allCounts = workloadData.flatMap(d => d.dailyCounts.map(c => c.count))
                                            const maxCount = Math.max(...allCounts, 1) // Avoid div by zero
                                            const height = (day.count / maxCount) * 100

                                            const isToday = idx === driver.dailyCounts.length - 1

                                            return (
                                                <div
                                                    key={idx}
                                                    className="flex-1 flex flex-col items-center gap-0.5 group"
                                                >
                                                    <div className="w-full relative h-full flex items-end bg-muted/50 rounded-sm overflow-hidden">
                                                        <div
                                                            className={`w-full transition-all duration-500 ${isToday ? 'bg-primary' : 'bg-slate-400/60 dark:bg-slate-600'
                                                                }`}
                                                            style={{ height: `${Math.max(height, 5)}%` }}
                                                        />
                                                    </div>
                                                    {/* Tooltip on hover could go here, for now just day letter */}
                                                    <span className={`text-[8px] ${isToday ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
                                                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'narrow' })}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Summary Footer */}
                    <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground flex justify-between">
                        <span>Team Avg (7d): <strong>{teamAverage.toFixed(1)}</strong></span>
                        {workloadData.some(d => d.total < teamAverage * 0.8) && (
                            <span className="text-orange-600 dark:text-orange-400">
                                💡 Unbalanced distribution detected
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
