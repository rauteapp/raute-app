
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { format, isToday, isYesterday } from 'date-fns'
import { Clock, Zap, Moon } from 'lucide-react'

export function DriverActivityHistory({ driverId }: { driverId: string | null }) {
    const [logs, setLogs] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (driverId) fetchLogs()
    }, [driverId])

    async function fetchLogs() {
        try {
            const { data, error } = await supabase
                .from('driver_activity_logs')
                .select('*')
                .eq('driver_id', driverId)
                .order('timestamp', { ascending: false })
                .limit(50)

            if (error) {
                console.error('Failed to fetch driver activity logs:', error.message, error)
                throw error
            }
            setLogs(data || [])
        } catch (err: any) {
            console.error('Driver Activity Logs Error:', err?.message || err)
            setLogs([])
        } finally {
            setIsLoading(false)
        }
    }

    // Group logs by date
    const groupedLogs = useMemo(() => {
        const groups: { label: string; logs: typeof logs }[] = []
        let currentLabel = ''

        for (const log of logs) {
            const date = new Date(log.timestamp)
            let label: string
            if (isToday(date)) label = 'Today'
            else if (isYesterday(date)) label = 'Yesterday'
            else label = format(date, 'MMM dd, yyyy')

            if (label !== currentLabel) {
                currentLabel = label
                groups.push({ label, logs: [log] })
            } else {
                groups[groups.length - 1].logs.push(log)
            }
        }
        return groups
    }, [logs])

    if (isLoading) return (
        <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex gap-3 items-center p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
                    <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-2.5 w-28" />
                    </div>
                    <Skeleton className="h-5 w-14 rounded-full" />
                </div>
            ))}
        </div>
    )

    if (logs.length === 0) return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mb-4 shadow-sm">
                <Clock size={28} className="text-slate-400" />
            </div>
            <p className="text-[15px] font-semibold text-slate-600 dark:text-slate-300">No activity yet</p>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-1 max-w-[200px]">Your shift history and status changes will appear here</p>
        </div>
    )

    return (
        <ScrollArea className="h-[calc(100vh-180px)]">
            <div className="space-y-5 pb-8">
                {groupedLogs.map((group) => (
                    <div key={group.label}>
                        {/* Date label */}
                        <div className="flex items-center gap-2 mb-2.5">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                {group.label}
                            </span>
                            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                {group.logs.length} events
                            </span>
                        </div>

                        {/* Log cards */}
                        <div className="space-y-1.5">
                            {group.logs.map((log) => {
                                const isOnline = log.status === 'online'
                                const isOffline = log.status === 'offline'

                                return (
                                    <div
                                        key={log.id}
                                        className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                                    >
                                        {/* Icon */}
                                        <div className={`
                                            w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                                            ${isOnline
                                                ? 'bg-emerald-50 dark:bg-emerald-950/30'
                                                : isOffline
                                                    ? 'bg-slate-100 dark:bg-slate-800/60'
                                                    : 'bg-blue-50 dark:bg-blue-950/30'
                                            }
                                        `}>
                                            {isOnline ? (
                                                <Zap size={18} className="text-emerald-500" />
                                            ) : isOffline ? (
                                                <Moon size={18} className="text-slate-400 dark:text-slate-500" />
                                            ) : (
                                                <Clock size={18} className="text-blue-500" />
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                                                {isOnline ? 'Started Shift' : isOffline ? 'Ended Shift' : 'Working'}
                                            </p>
                                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                                                {format(new Date(log.timestamp), 'h:mm a')}
                                            </p>
                                        </div>

                                        {/* Badge */}
                                        <span className={`
                                            text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg shrink-0
                                            ${isOnline
                                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                                : isOffline
                                                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                    : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                                            }
                                        `}>
                                            {isOnline ? 'Online' : isOffline ? 'Offline' : 'Active'}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Metadata for entries that have it */}
                        {group.logs.some(l => l.metadata && Object.keys(l.metadata).length > 0) && (
                            <div className="mt-2 space-y-1">
                                {group.logs.filter(l => l.metadata && Object.keys(l.metadata).length > 0).map(log => (
                                    <div key={`meta-${log.id}`} className="flex flex-wrap gap-1 pl-1">
                                        {Object.entries(log.metadata).map(([key, val]) => (
                                            <span key={key} className="text-[9px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 px-2 py-0.5 rounded-md">
                                                {key}: {String(val)}
                                            </span>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </ScrollArea>
    )
}
