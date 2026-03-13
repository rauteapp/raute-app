"use client"

import React, { createContext, useContext, useState, useCallback, useEffect } from "react"
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react"
import { hapticSuccess, hapticError } from "@/lib/haptics"
import { cn } from "@/lib/utils"

type ToastType = 'success' | 'error' | 'info'

interface Toast {
    id: string
    title: string
    description?: string
    type: ToastType
}

interface ToastContextType {
    toast: (props: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) throw new Error("useToast must be used within a ToastProvider")
    return context
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = useCallback(({ title, description, type }: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).substring(7)
        // Only keep the most recent toast
        setToasts([{ id, title, description, type }])

        // Haptic feedback based on toast type
        if (type === 'success') hapticSuccess()
        else if (type === 'error') hapticError()

        // Auto dismiss
        setTimeout(() => removeToast(id), 5000)
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    useEffect(() => {
        const handleExternalToast = (event: any) => {
            if (event.detail) addToast(event.detail)
        }
        window.addEventListener('app-toast', handleExternalToast)
        return () => window.removeEventListener('app-toast', handleExternalToast)
    }, [addToast])

    return (
        <ToastContext.Provider value={{ toast: addToast }}>
            {children}
            {/* Top Right, smaller width */}
            <div className="fixed top-14 right-4 sm:top-6 sm:right-6 w-[280px] z-[9999] flex flex-col gap-2 pointer-events-none safe-area-pt">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={cn(
                            "pointer-events-auto flex items-center gap-2.5 p-3 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)] border animate-in slide-in-from-right-8 fade-in zoom-in-95 duration-300",
                            t.type === 'success' ? "bg-white dark:bg-[#18181B] border-emerald-100 dark:border-emerald-500/20" :
                            t.type === 'error' ? "bg-white dark:bg-[#18181B] border-red-100 dark:border-red-500/20" :
                            "bg-white dark:bg-[#18181B] border-slate-100 dark:border-slate-800"
                        )}
                    >
                        <div className={cn(
                            "h-7 w-7 shrink-0 rounded-full flex items-center justify-center",
                            t.type === 'success' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" :
                            t.type === 'error' ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" :
                            "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                        )}>
                            {t.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={3} />}
                            {t.type === 'error' && <AlertCircle className="h-3.5 w-3.5" strokeWidth={3} />}
                            {t.type === 'info' && <Info className="h-3.5 w-3.5" strokeWidth={3} />}
                        </div>

                        <div className="flex-1">
                            <h4 className="font-bold text-[13px] leading-tight text-slate-900 dark:text-white">{t.title}</h4>
                            {t.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{t.description}</p>}
                        </div>
                        <button 
                            onClick={() => removeToast(t.id)} 
                            className="shrink-0 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}
