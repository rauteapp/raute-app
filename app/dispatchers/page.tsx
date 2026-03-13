'use client'

import { useEffect, useState } from 'react'
import { supabase, User as AppUser } from '@/lib/supabase'
import { waitForSession } from '@/lib/wait-for-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { UserCog, Plus, Trash2, Power, Lock, Unlock, ShieldAlert, Send } from 'lucide-react'
import { useToast } from '@/components/toast-provider'
import { Skeleton } from '@/components/ui/skeleton'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { PullToRefresh } from '@/components/pull-to-refresh'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Permission Config
const AVAILABLE_PERMISSIONS = [
    { id: 'view_orders', label: 'View All Orders' },
    { id: 'create_orders', label: 'Create/Import Orders' },
    { id: 'edit_orders', label: 'Edit Order Details' },
    { id: 'delete_orders', label: 'Delete Orders' },
    { id: 'view_drivers', label: 'View Drivers & Map' },
    { id: 'manage_drivers', label: 'Manage Drivers (Add/Edit)' },
    { id: 'access_settings', label: 'Access Company Settings' }
]

export default function DispatchersPage() {
    const [dispatchers, setDispatchers] = useState<AppUser[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const { toast } = useToast()

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        permissions: {
            view_orders: true,
            view_drivers: true
        } as Record<string, boolean>
    })

    useEffect(() => {
        fetchDispatchers()
    }, [])

    async function fetchDispatchers() {
        setIsLoading(true)
        try {
            let currentUserId: string | null = null
            const session = await waitForSession()

            if (session?.user) {
                currentUserId = session.user.id
            }

            if (!currentUserId) {
                try {
                    const { data: userData } = await supabase.auth.getUser()
                    if (userData.user) currentUserId = userData.user.id
                } catch { }
            }

            if (!currentUserId) {
                return
            }

            const { data: currentUser, error: userError } = await supabase.from('users').select('company_id, role').eq('id', currentUserId).single()

            let userData = currentUser

            if (userError || !userData) {
                try {
                    const res = await authenticatedFetch('/api/user-profile')
                    if (res.ok) {
                        const apiData = await res.json()
                        if (apiData.success && apiData.user) {
                            userData = apiData.user
                        }
                    }
                } catch (apiErr) {
                }
            }

            if (!userData) {
                toast({ title: "Profile Error", description: "Could not fetch user profile.", type: "error" })
                return
            }

            if (userData.role === 'driver') {
                window.location.href = '/dashboard'
                return
            }

            const { data, error } = await supabase.rpc('get_company_dispatchers', {
                company_id_param: userData.company_id
            })

            if (error) throw error
            setDispatchers((data as unknown as AppUser[]) || [])
        } catch (error) {
            toast({ title: 'Error loading team', type: 'error' })
        } finally {
            setIsLoading(false)
        }
    }

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [editingDispatcher, setEditingDispatcher] = useState<AppUser | null>(null)
    const [deletingDispatcher, setDeletingDispatcher] = useState<AppUser | null>(null)

    function openEdit(dispatcher: AppUser) {
        setEditingDispatcher(dispatcher)
        setFormData({
            name: dispatcher.full_name || '',
            email: dispatcher.email || '',
            permissions: (dispatcher.permissions as Record<string, boolean>) || {}
        })
        setIsAddOpen(true)
    }

    function initiateDelete(dispatcher: AppUser) {
        setDeletingDispatcher(dispatcher)
    }

    async function handleDeleteDispatcher() {
        if (!deletingDispatcher) return
        try {
            const { error, data } = await supabase.rpc('delete_user_by_admin', { target_user_id: deletingDispatcher.id })

            if (error) throw error
            if (data && !data.success) throw new Error(data.error || 'Failed to delete')

            setDispatchers(prev => prev.filter(d => d.id !== deletingDispatcher.id))
            toast({ title: 'Dispatcher Deleted', type: 'success' })
            setDeletingDispatcher(null)
        } catch (e) {
            toast({ title: 'Delete Failed', type: 'error' })
        }
    }

    async function handleResendSetupEmail(dispatcher: AppUser) {
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch('/api/auth/send-welcome', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ email: dispatcher.email, name: dispatcher.full_name, role: 'dispatcher', userId: dispatcher.id }),
            })

            if (res.ok) {
                toast({ title: 'Setup email sent!', description: `${dispatcher.full_name} will receive a welcome email at ${dispatcher.email} to set their password.`, type: 'success' })
            } else {
                toast({ title: 'Failed to send setup email', description: 'Please try again.', type: 'error' })
            }
        } catch {
            toast({ title: 'Failed to send setup email', type: 'error' })
        }
    }

    async function handleSubmit() {
        if (editingDispatcher) {
            // UPDATE MODE
            setIsSubmitting(true)
            try {
                const { error, data } = await supabase.rpc('update_dispatcher_account', {
                    target_user_id: editingDispatcher.id,
                    full_name: formData.name,
                    email: formData.email,
                    permissions: formData.permissions
                })

                if (error) throw error
                if (data && !data.success) throw new Error(data.error || 'Update failed')

                toast({ title: 'Dispatcher Updated', type: 'success' })
                setIsAddOpen(false)
                setEditingDispatcher(null)
                fetchDispatchers()
            } catch (e) {
                toast({ title: 'Update Error', type: 'error' })
            } finally {
                setIsSubmitting(false)
            }
        } else {
            // CREATE MODE
            handleCreateDispatcher()
        }
    }

    async function handleCreateDispatcher() {

        if (!formData.name || !formData.email) {
            toast({ title: 'Missing Fields', description: 'Please fill in name and email.', type: 'error' })
            return
        }

        setIsSubmitting(true)
        try {
            // Auth Check
            let currentUserId = null
            const { data: { session } } = await supabase.auth.getSession()

            if (session?.user) {
                currentUserId = session.user.id
            }

            if (!currentUserId) throw new Error("No authenticated user found")

            // Get Company ID
            let companyUser = null
            const { data: directUser } = await supabase.from('users').select('company_id').eq('id', currentUserId).single()
            companyUser = directUser

            if (!companyUser) {
                try {
                    const res = await authenticatedFetch('/api/user-profile')
                    if (res.ok) {
                        const apiData = await res.json()
                        if (apiData.success && apiData.user) {
                            companyUser = apiData.user
                        }
                    }
                } catch { }
            }
            if (!companyUser) throw new Error("No company found")

            // Generate random password (dispatcher will set their own via email)
            const randomPassword = crypto.randomUUID() + 'Aa1!'

            // RPC Call
            const { data, error } = await supabase.rpc('create_dispatcher_account', {
                email: formData.email,
                password: randomPassword,
                full_name: formData.name,
                company_id: companyUser.company_id,
                permissions: formData.permissions
            })

            if (error) throw error
            if (data && !data.success) throw new Error(data.error || "Failed to create dispatcher")

            // Send branded welcome email
            try {
                const { data: { session } } = await supabase.auth.getSession()
                const welcomeRes = await fetch('/api/auth/send-welcome', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`,
                    },
                    body: JSON.stringify({ email: formData.email, name: formData.name, role: 'dispatcher', userId: data?.user_id }),
                })

                if (welcomeRes.ok) {
                    toast({
                        title: 'Dispatcher Created!',
                        description: `A welcome email has been sent to ${formData.email} to set their password.`,
                        type: 'success'
                    })
                } else {
                    toast({
                        title: 'Dispatcher Created!',
                        description: `Account created but welcome email failed. You can resend it from the dispatcher's card.`,
                        type: 'success'
                    })
                }
            } catch {
                toast({
                    title: 'Dispatcher Created!',
                    description: `Account created but welcome email failed. You can resend it from the dispatcher's card.`,
                    type: 'success'
                })
            }

            setIsAddOpen(false)
            setFormData({ name: '', email: '', permissions: { view_orders: true, view_drivers: true } })
            fetchDispatchers()

        } catch (error: any) {
            toast({
                title: 'Error Creating Dispatcher',
                description: error.message || "An unexpected error occurred",
                type: 'error'
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    async function toggleStatus(dispatcher: AppUser) {
        const newStatus = dispatcher.status === 'suspended' ? 'active' : 'suspended'
        try {
            const { error } = await supabase
                .from('users')
                .update({ status: newStatus })
                .eq('id', dispatcher.id)

            if (error) throw error

            setDispatchers(prev => prev.map(d => d.id === dispatcher.id ? { ...d, status: newStatus } : d))
            toast({ title: `Account ${newStatus === 'active' ? 'Unfrozen' : 'Frozen'}`, type: 'success' })
        } catch (error) {
            toast({ title: 'Update Failed', type: 'error' })
        }
    }

    // LOADING SKELETON
    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-slate-50 to-slate-100 dark:from-blue-950/20 dark:via-slate-950 dark:to-slate-900">
                <header
                    className="sticky top-0 z-20 px-5 pb-5 flex items-center justify-between bg-white/70 dark:bg-slate-950/70 backdrop-blur-2xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm"
                    style={{ paddingTop: 'max(env(safe-area-inset-top), 3.5rem)' }}
                >
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-7 w-48 rounded-full" />
                        <Skeleton className="h-4 w-64 rounded-full" />
                    </div>
                    <Skeleton className="h-10 w-32 rounded-full" />
                </header>
                <div className="p-5 max-w-7xl mx-auto space-y-8 mt-2">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="rounded-[32px] p-6 bg-white/60 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-4">
                                <div className="flex justify-between items-center">
                                    <Skeleton className="h-6 w-32 rounded-full" />
                                    <Skeleton className="h-5 w-16 rounded-full" />
                                </div>
                                <Skeleton className="h-4 w-48 rounded-full" />
                                <div className="space-y-2 pt-4">
                                    <Skeleton className="h-3 w-20 rounded-full" />
                                    <div className="flex gap-2">
                                        <Skeleton className="h-5 w-16 rounded-[8px]" />
                                        <Skeleton className="h-5 w-24 rounded-[8px]" />
                                    </div>
                                </div>
                                <div className="pt-4 flex gap-2">
                                    <Skeleton className="h-9 flex-1 rounded-full" />
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <PullToRefresh onRefresh={fetchDispatchers}>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-slate-50 to-slate-100 dark:from-blue-950/20 dark:via-slate-950 dark:to-slate-900">

                <header
                    className="sticky top-0 z-20 px-5 pb-5 flex items-center justify-between bg-white/70 dark:bg-slate-950/70 backdrop-blur-2xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm"
                    style={{ paddingTop: 'max(env(safe-area-inset-top), 3.5rem)' }}
                >
                    <div className="flex flex-col">
                        <h1 className="text-[22px] leading-none font-black text-slate-900 dark:text-white tracking-tight">Dispatch Team</h1>
                        <p className="text-[13px] font-semibold text-slate-500 mt-1">Manage dispatchers and access limits.</p>
                    </div>

                    <Sheet open={isAddOpen} onOpenChange={(open) => {
                        setIsAddOpen(open)
                        if (!open) {
                            setEditingDispatcher(null)
                            setFormData({ name: '', email: '', permissions: { view_orders: true, view_drivers: true } })
                        }
                    }}>
                        <SheetTrigger asChild>
                            <Button size="sm" className="gap-2 h-10 rounded-[20px] px-4 shadow-sm bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 transition-all font-bold">
                                <Plus size={18} strokeWidth={3} /> <span className="hidden sm:inline">Add Dispatcher</span><span className="sm:hidden">Add</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="h-[90vh] rounded-t-[32px] p-6 overflow-y-auto safe-area-pt bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border-t border-slate-200/50 dark:border-slate-800/50 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                            <SheetHeader className="mb-6">
                                <SheetTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{editingDispatcher ? 'Edit Dispatcher' : 'Add New Dispatcher'}</SheetTitle>
                            </SheetHeader>
                            <div className="space-y-6 pb-32 px-1">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Full Name</label>
                                    <Input
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Sarah Smith"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Email</label>
                                    <Input
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="dispatcher@company.com"
                                    />
                                </div>

                                {!editingDispatcher && (
                                    <div className="bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 text-sm p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <p className="font-medium">A setup email will be sent to this address.</p>
                                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">The dispatcher will set their own password via the link in the email.</p>
                                    </div>
                                )}

                                {editingDispatcher && (
                                    <div className="space-y-2 pt-2 border-t border-border">
                                        <label className="text-sm font-medium">Account Setup</label>
                                        <p className="text-xs text-muted-foreground">Send a setup email so this dispatcher can set or reset their password.</p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleResendSetupEmail(editingDispatcher)}
                                        >
                                            <Send size={14} className="mr-2" />
                                            Send Setup Email
                                        </Button>
                                    </div>
                                )}

                                <div className="pt-4 border-t">
                                    <label className="text-sm font-bold mb-3 block flex items-center gap-2">
                                        <ShieldAlert size={14} /> Access Limitations
                                    </label>
                                    <div className="space-y-3">
                                        {AVAILABLE_PERMISSIONS.map(perm => (
                                            <div key={perm.id} className="flex items-center gap-2">
                                                <Checkbox
                                                    id={perm.id}
                                                    checked={!!formData.permissions?.[perm.id]}
                                                    onCheckedChange={(checked) => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            permissions: {
                                                                ...prev.permissions,
                                                                [perm.id]: checked === true
                                                            }
                                                        }))
                                                    }}
                                                />
                                                <label htmlFor={perm.id} className="text-sm cursor-pointer select-none">
                                                    {perm.label}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Button onClick={handleSubmit} className="w-full h-12 text-lg font-bold rounded-[16px] mt-4" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : (editingDispatcher ? 'Save Changes' : 'Create Account')}
                                </Button>
                            </div>
                        </SheetContent>
                    </Sheet>
                </header>

                <main className="p-5 max-w-7xl mx-auto space-y-8 mt-2">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {dispatchers.length === 0 && (
                            <div className="col-span-full border-dashed border-2 border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 rounded-[32px] flex flex-col items-center justify-center py-20 text-center shadow-sm backdrop-blur-sm mx-2">
                                <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-5 rotate-3 border border-slate-200 dark:border-slate-700 shadow-sm">
                                    <UserCog className="h-8 w-8 text-slate-400 dark:text-slate-500" strokeWidth={2} />
                                </div>
                                <h3 className="text-[17px] font-black text-slate-800 dark:text-slate-200 tracking-tight">No dispatchers found</h3>
                                <p className="text-[14px] font-medium text-slate-500 dark:text-slate-400 mt-2 max-w-[260px] leading-relaxed">Add a dispatcher to allow them to manage your drivers and orders.</p>
                            </div>
                        )}

                        {dispatchers.map(dispatcher => (
                            <div key={dispatcher.id} className={`group relative flex flex-col overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg transition-all rounded-[32px] p-6 ${dispatcher.status === 'suspended' ? 'opacity-70 grayscale-[0.3]' : ''}`}>
                                <div className="flex flex-row items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[20px] shadow-sm flex items-center justify-center shrink-0 border border-white/20">
                                            <UserCog size={22} className="text-white" strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <h3 className="text-[17px] font-black text-slate-900 dark:text-white tracking-tight truncate pb-0.5">{dispatcher.full_name}</h3>
                                            <div className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{dispatcher.email}</div>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] px-2 py-1 rounded-[8px] uppercase font-black tracking-wider border ${dispatcher.status === 'suspended' ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/60' : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60'}`}>
                                        {dispatcher.status || 'active'}
                                    </span>
                                </div>

                                <div className="space-y-1 mb-6 flex-1">
                                    <p className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-2 tracking-widest">Permissions:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {Object.entries(dispatcher.permissions || {}).map(([key, val]) => (
                                            val && <span key={key} className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded-[10px] text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">{key.replace('_', ' ')}</span>
                                        ))}
                                        {Object.keys(dispatcher.permissions || {}).length === 0 && <span className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2 py-1 rounded-[10px]">Read Only</span>}
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800/60 mt-auto items-center">
                                    <Button
                                        variant="outline"
                                        className={`flex-1 h-11 rounded-full font-bold shadow-sm ${dispatcher.status === 'suspended' ? 'text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60' : 'text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 dark:border-amber-900/40 dark:bg-amber-950/40 dark:hover:bg-amber-900/60'}`}
                                        onClick={() => toggleStatus(dispatcher)}
                                    >
                                        {dispatcher.status === 'suspended' ? <Unlock size={16} className="mr-1.5" strokeWidth={2.5} /> : <Lock size={16} className="mr-1.5" strokeWidth={2.5} />}
                                        {dispatcher.status === 'suspended' ? 'Unfreeze' : 'Freeze'}
                                    </Button>

                                    <button
                                        className="h-11 w-11 flex items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200/50 dark:border-blue-900/50"
                                        onClick={() => handleResendSetupEmail(dispatcher)}
                                        title="Resend Setup Email"
                                    >
                                        <Send size={18} strokeWidth={2} />
                                    </button>

                                    <button
                                        className="h-11 w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200/50 dark:border-slate-700/50"
                                        onClick={() => openEdit(dispatcher)}
                                        title="Edit Dispatcher"
                                    >
                                        <UserCog size={18} strokeWidth={2} />
                                    </button>

                                    <button
                                        className="h-11 w-11 flex items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/30 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors border border-rose-100 dark:border-rose-900/50"
                                        onClick={() => initiateDelete(dispatcher)}
                                        title="Delete Dispatcher"
                                    >
                                        <Trash2 size={18} strokeWidth={2} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>

                {/* DELETE ALERT */}
                <AlertDialog open={!!deletingDispatcher} onOpenChange={() => setDeletingDispatcher(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Dispatcher?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete <b>{deletingDispatcher?.full_name}</b>? This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteDispatcher} className="bg-red-600">Delete Account</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </PullToRefresh>
    )
}
