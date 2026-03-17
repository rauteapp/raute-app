"use client"

import { Bell, Package, Truck, MapPin, AlertCircle, CheckCircle2, UserX, Check, Clock, AlertTriangle, PackageX, X, BellOff } from "lucide-react"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { useNotifications, type AppNotification } from "@/hooks/use-notifications"
import { useRouter } from "next/navigation"
import { useState, useMemo } from "react"

const notificationConfig: Record<string, { icon: typeof Bell; color: string; bg: string; darkBg: string }> = {
    order_assigned: { icon: Package, color: 'text-blue-500', bg: 'bg-blue-50', darkBg: 'dark:bg-blue-950/30' },
    order_unassigned: { icon: Package, color: 'text-slate-400', bg: 'bg-slate-100', darkBg: 'dark:bg-slate-800' },
    route_updated: { icon: MapPin, color: 'text-violet-500', bg: 'bg-violet-50', darkBg: 'dark:bg-violet-950/30' },
    delivery_completed: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50', darkBg: 'dark:bg-emerald-950/30' },
    driver_offline: { icon: UserX, color: 'text-amber-500', bg: 'bg-amber-50', darkBg: 'dark:bg-amber-950/30' },
    out_of_range: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', darkBg: 'dark:bg-red-950/30' },
    time_window_warning: { icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50', darkBg: 'dark:bg-orange-950/30' },
    time_window_expired: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', darkBg: 'dark:bg-red-950/30' },
    unassigned_urgent: { icon: PackageX, color: 'text-red-500', bg: 'bg-red-50', darkBg: 'dark:bg-red-950/30' },
}

const defaultConfig = { icon: Bell, color: 'text-slate-400', bg: 'bg-slate-100', darkBg: 'dark:bg-slate-800' }

function timeAgo(dateString: string): string {
    const now = new Date()
    const date = new Date(dateString)
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function NotificationItem({ notification, onRead, onNavigate }: {
    notification: AppNotification
    onRead: (id: string) => void
    onNavigate: (route: string) => void
}) {
    const route = notification.data?.route || (notification.type.startsWith('order') || notification.type === 'delivery_completed' || notification.type === 'out_of_range' ? '/orders' : '/dashboard')
    const config = notificationConfig[notification.type] || defaultConfig
    const Icon = config.icon

    return (
        <button
            onClick={() => {
                if (!notification.is_read) onRead(notification.id)
                onNavigate(route)
            }}
            className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all rounded-2xl mx-1 ${
                notification.is_read
                    ? 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    : 'bg-blue-50/40 dark:bg-blue-950/15 hover:bg-blue-50/70 dark:hover:bg-blue-950/25'
            } active:scale-[0.98]`}
        >
            <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${config.bg} ${config.darkBg}`}>
                <Icon size={16} className={config.color} />
            </div>
            <div className="flex-1 min-w-0 py-0.5">
                <div className="flex items-start justify-between gap-2">
                    <p className={`text-[13px] leading-snug ${notification.is_read ? 'font-medium text-slate-600 dark:text-slate-300' : 'font-bold text-slate-900 dark:text-white'}`}>
                        {notification.title}
                    </p>
                    {!notification.is_read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                    )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {notification.body}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-semibold uppercase tracking-wider">
                    {timeAgo(notification.created_at)}
                </p>
            </div>
        </button>
    )
}

export function NotificationBell({ userId }: { userId: string | null }) {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(userId)
    const router = useRouter()
    const [open, setOpen] = useState(false)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <button className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <Bell size={22} className="text-slate-600 dark:text-slate-400" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1 shadow-sm animate-in zoom-in-50">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl shadow-2xl max-h-[85vh] p-0 flex flex-col" hideClose>
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                </div>

                {/* Header */}
                <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-800/60 px-5 pb-4">
                    <SheetHeader className="p-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                    <Bell size={18} className="text-white" />
                                </div>
                                <div>
                                    <SheetTitle className="text-[17px] font-bold text-slate-900 dark:text-white">Notifications</SheetTitle>
                                    <SheetDescription className="text-[11px] text-slate-400 dark:text-slate-500">
                                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                                    </SheetDescription>
                                </div>
                            </div>
                            <SheetClose asChild>
                                <button className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95">
                                    <X size={16} className="text-slate-500 dark:text-slate-400" />
                                    <span className="sr-only">Close</span>
                                </button>
                            </SheetClose>
                        </div>
                    </SheetHeader>

                    {/* Mark all read */}
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 text-[12px] font-bold hover:bg-blue-100 dark:hover:bg-blue-950/30 transition-colors active:scale-[0.98]"
                        >
                            <Check size={14} />
                            Mark all as read
                        </button>
                    )}
                </div>

                {/* Notification list */}
                <div className="flex-1 overflow-y-auto px-3 py-2">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-20">
                            <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mb-4 shadow-sm">
                                <BellOff size={28} className="text-slate-400" />
                            </div>
                            <p className="text-[15px] font-semibold text-slate-600 dark:text-slate-300">All clear</p>
                            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-1 max-w-[200px]">You have no notifications right now. We&apos;ll let you know when something comes up.</p>
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {notifications.map(notification => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onRead={markAsRead}
                                    onNavigate={(route) => {
                                        setOpen(false)
                                        router.push(route)
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
