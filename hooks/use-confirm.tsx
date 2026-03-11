'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, Trash2, LogOut, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type ConfirmVariant = 'default' | 'destructive' | 'warning'

interface ConfirmOptions {
    title: string
    description: string
    confirmText?: string
    cancelText?: string
    variant?: ConfirmVariant
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
    const fn = useContext(ConfirmContext)
    if (!fn) throw new Error('useConfirm must be used within ConfirmProvider')
    return fn
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false)
    const [options, setOptions] = useState<ConfirmOptions>({
        title: '',
        description: '',
    })
    const resolveRef = useRef<((value: boolean) => void) | null>(null)

    const confirm = useCallback<ConfirmFn>((opts) => {
        setOptions(opts)
        setOpen(true)
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve
        })
    }, [])

    const handleAction = () => {
        setOpen(false)
        resolveRef.current?.(true)
        resolveRef.current = null
    }

    const handleCancel = () => {
        setOpen(false)
        resolveRef.current?.(false)
        resolveRef.current = null
    }

    const variant = options.variant || 'default'

    const iconMap = {
        default: <Info className="h-5 w-5 text-blue-500" />,
        destructive: <Trash2 className="h-5 w-5 text-red-500" />,
        warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    }

    const actionStyles = {
        default: 'bg-blue-600 hover:bg-blue-700 text-white',
        destructive: 'bg-red-600 hover:bg-red-700 text-white',
        warning: 'bg-amber-600 hover:bg-amber-700 text-white',
    }

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AlertDialog open={open} onOpenChange={(v) => !v && handleCancel()}>
                <AlertDialogContent className="max-w-sm rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-0 overflow-hidden">
                    <AlertDialogHeader className="px-6 pt-6 pb-2">
                        <div className="flex items-start gap-3">
                            <div className={cn(
                                'flex-shrink-0 mt-0.5 w-10 h-10 rounded-full flex items-center justify-center',
                                variant === 'destructive' && 'bg-red-50 dark:bg-red-950/30',
                                variant === 'warning' && 'bg-amber-50 dark:bg-amber-950/30',
                                variant === 'default' && 'bg-blue-50 dark:bg-blue-950/30',
                            )}>
                                {iconMap[variant]}
                            </div>
                            <div className="flex-1 min-w-0">
                                <AlertDialogTitle className="text-base font-semibold text-slate-900 dark:text-white">
                                    {options.title}
                                </AlertDialogTitle>
                                <AlertDialogDescription className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {options.description}
                                </AlertDialogDescription>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row gap-2 px-6 pb-6 pt-4">
                        <AlertDialogCancel
                            onClick={handleCancel}
                            className="flex-1 h-11 rounded-xl border-slate-200 dark:border-slate-800 font-medium"
                        >
                            {options.cancelText || 'Cancel'}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleAction}
                            className={cn('flex-1 h-11 rounded-xl font-medium border-0', actionStyles[variant])}
                        >
                            {options.confirmText || (variant === 'destructive' ? 'Delete' : 'Continue')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmContext.Provider>
    )
}
