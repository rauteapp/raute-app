"use client"

import React, { createContext, useContext, useState, useCallback } from "react"
import { X, CheckCircle, AlertCircle, Info } from "lucide-react"
import { hapticSuccess, hapticError } from "@/lib/haptics"

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
        setToasts(prev => [...prev, { id, title, description, type }])

        // Haptic feedback based on toast type
        if (type === 'success') hapticSuccess()
        else if (type === 'error') hapticError()

        // Auto dismiss
        setTimeout(() => removeToast(id), 5000)
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    React.useEffect(() => {
        const handleExternalToast = (event: any) => {
            if (event.detail) addToast(event.detail)
        }
        window.addEventListener('app-toast', handleExternalToast)
        return () => window.removeEventListener('app-toast', handleExternalToast)
    }, [addToast])

    return (
        <ToastContext.Provider value={{ toast: addToast }}>
            {children}
            <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-96 z-[9999] flex flex-col gap-2 pointer-events-none safe-area-pb">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border animate-in slide-in-from-bottom-5 fade-in zoom-in-95 duration-300 ${t.type === 'success' ? 'bg-green-600 text-white border-green-700' :
                            t.type === 'error' ? 'bg-red-600 text-white border-red-700' :
                                'bg-slate-800 text-white border-slate-700'
                            }`}
                    >
                        {t.type === 'success' && <CheckCircle className="shrink-0 h-5 w-5" />}
                        {t.type === 'error' && <AlertCircle className="shrink-0 h-5 w-5" />}
                        {t.type === 'info' && <Info className="shrink-0 h-5 w-5" />}

                        <div className="flex-1">
                            <h4 className="font-bold text-sm leading-tight">{t.title}</h4>
                            {t.description && <p className="text-xs opacity-90 mt-1 leading-relaxed">{t.description}</p>}
                        </div>
                        <button onClick={() => removeToast(t.id)} className="shrink-0"><X className="h-4 w-4 opacity-70 hover:opacity-100" /></button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}
