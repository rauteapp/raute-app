"use client"

import { Bell, Package, Truck, MapPin, AlertCircle, CheckCircle2, UserX, Check } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { useNotifications, type AppNotification } from "@/hooks/use-notifications"
import { useRouter } from "next/navigation"
import { useState } from "react"

function getNotificationIcon(type: string) {
    switch (type) {
        case 'order_assigned': return <Package size={16} className="text-blue-500" />
        case 'order_unassigned': return <Package size={16} className="text-slate-400" />
        case 'route_updated': return <MapPin size={16} className="text-purple-500" />
        case 'delivery_completed': return <CheckCircle2 size={16} className="text-emerald-500" />
        case 'driver_offline': return <UserX size={16} className="text-amber-500" />
        case 'out_of_range': return <AlertCircle size={16} className="text-red-500" />
        default: return <Bell size={16} className="text-slate-400" />
    }
}

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

    return (
        <button
            onClick={() => {
                if (!notification.is_read) onRead(notification.id)
                onNavigate(route)
            }}
            className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 ${
                notification.is_read
                    ? 'bg-white dark:bg-slate-950'
                    : 'bg-blue-50/50 dark:bg-blue-950/20'
            } hover:bg-slate-50 dark:hover:bg-slate-900 active:bg-slate-100 dark:active:bg-slate-800`}
        >
            <div className="mt-0.5 flex-shrink-0">
                {getNotificationIcon(notification.type)}
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-sm leading-tight ${notification.is_read ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-bold text-slate-900 dark:text-white'}`}>
                    {notification.title}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {notification.body}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium">
                    {timeAgo(notification.created_at)}
                </p>
            </div>
            {!notification.is_read && (
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
            )}
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
                        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1 shadow-sm">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[400px] p-0 flex flex-col">
                <SheetHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="text-lg font-black tracking-tight">Notifications</SheetTitle>
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={markAllAsRead}
                                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 h-8 px-3"
                            >
                                <Check size={14} className="mr-1" /> Mark all read
                            </Button>
                        )}
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
                            <Bell size={40} className="mb-3 opacity-30" />
                            <p className="text-sm font-medium">No notifications yet</p>
                        </div>
                    ) : (
                        notifications.map(notification => (
                            <NotificationItem
                                key={notification.id}
                                notification={notification}
                                onRead={markAsRead}
                                onNavigate={(route) => {
                                    setOpen(false)
                                    router.push(route)
                                }}
                            />
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
