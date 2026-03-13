
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { Activity, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

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
            // Set empty logs on error to show "No activity" message
            setLogs([])
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>

    if (logs.length === 0) return <div className="text-center text-sm text-slate-400 py-6">No activity recorded yet.</div>

    return (
        <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-800 before:to-transparent">
            {logs.map((log, i) => (
                <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active pb-8 last:pb-0">
                    {/* Icon / Marker */}
                    <div className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-slate-950 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 relative",
                        log.status === 'online' ? 'bg-emerald-50 text-emerald-600' :
                        log.status === 'offline' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 
                        'bg-blue-50 text-blue-600'
                    )}>
                        {log.status === 'online' ? <Activity size={18} /> : 
                         log.status === 'offline' ? <Clock size={18} className="opacity-50" /> : 
                         <Activity size={18} />}
                    </div>
                    
                    {/* Content Card */}
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm ml-4 md:ml-0">
                        <div className="flex items-center justify-between mb-1">
                            <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                                log.status === 'online' ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                log.status === 'offline' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' : 
                                'bg-blue-100/50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            )}>
                                {log.status === 'online' ? 'Online Shift Started' : log.status === 'offline' ? 'Shift Ended' : 'Active'}
                            </span>
                            <time className="text-[10px] font-bold text-slate-400">
                                {format(new Date(log.timestamp), 'h:mm a')}
                            </time>
                        </div>
                        <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                            {format(new Date(log.timestamp), 'MMMM do, yyyy')}
                        </p>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className="mt-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/50">
                                <p className="text-[10px] text-slate-500 font-mono break-all line-clamp-2">
                                    {JSON.stringify(log.metadata)}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
