'use client'

import { useEffect, useState } from 'react'
import { supabase, User as AppUser } from '@/lib/supabase' // Use our type alias
import { waitForSession } from '@/lib/wait-for-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UserCog, Plus, Trash2, Power, Lock, Unlock, ShieldAlert } from 'lucide-react'
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
        password: '',
        permissions: {
            view_orders: true, // Default
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

            // On web, getSession() may time out due to navigator.locks — fallback to getUser()
            if (!currentUserId) {
                try {
                    const { data: userData } = await supabase.auth.getUser()
                    if (userData.user) currentUserId = userData.user.id
                } catch {}
            }

            if (!currentUserId) {
                return
            }

            const { data: currentUser, error: userError } = await supabase.from('users').select('company_id, role').eq('id', currentUserId).single()

            let userData = currentUser

            // FALLBACK: If direct query failed, use server-side API
            if (userError || !userData) {
                console.warn('⚠️ Dispatchers: Direct DB query failed:', userError?.message, '— trying fallback API...')
                try {
                    const res = await authenticatedFetch('/api/user-profile')
                    if (res.ok) {
                        const apiData = await res.json()
                        if (apiData.success && apiData.user) {
                            userData = apiData.user
                            console.log('✅ Dispatchers: Fallback API succeeded')
                        }
                    }
                } catch (apiErr) {
                    console.warn('⚠️ Dispatchers: Fallback API also failed:', apiErr)
                }
            }

            if (!userData) {
                toast({ title: "Profile Error", description: "Could not fetch user profile.", type: "error" })
                return
            }

            // 🚨 SECURITY: Manager/Admin Only 🚨
            if (userData.role === 'driver') {
                window.location.href = '/dashboard'
                return
            }

            // Use RPC to fetch dispatchers (Bypass RLS)
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

    // Helper to open Edit Sheet
    function openEdit(dispatcher: AppUser) {
        setEditingDispatcher(dispatcher)
        setFormData({
            name: dispatcher.full_name || '',
            email: dispatcher.email || '',
            password: '', // Leave blank if not changing
            permissions: (dispatcher.permissions as Record<string, boolean>) || {}
        })
        setIsAddOpen(true)
    }

    // Helper to initiate delete
    function initiateDelete(dispatcher: AppUser) {
        setDeletingDispatcher(dispatcher)
    }

    async function handleDeleteDispatcher() {
        if (!deletingDispatcher) return
        try {
            // const response = await fetch(`/api/manage-dispatcher?id=${deletingDispatcher.id}`, { method: 'DELETE' })
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

    async function handleSubmit() {
        if (editingDispatcher) {
            // UPDATE MODE
            setIsSubmitting(true)
            try {
                /* const response = await fetch('/api/manage-dispatcher', {
                     method: 'PUT', ...
                }) */

                // Use RPC
                const { error, data } = await supabase.rpc('update_dispatcher_account', {
                    target_user_id: editingDispatcher.id,
                    full_name: formData.name,
                    email: formData.email,
                    permissions: formData.permissions
                })

                if (error) throw error
                if (data && !data.success) throw new Error(data.error || 'Update failed')

                // If password provided, update it too
                if (formData.password) {
                    await supabase.rpc('update_user_password_by_admin', {
                        target_user_id: editingDispatcher.id,
                        new_password: formData.password
                    })
                }

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

        if (!formData.name || !formData.email || !formData.password) {
            toast({ title: 'Missing Fields', description: 'Please fill in all required fields.', type: 'error' })
            return
        }

        setIsSubmitting(true)
        try {
            // 1. Auth Check with Fallback
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

            // FALLBACK: If direct query failed, use server-side API
            if (!companyUser) {
                try {
                    const res = await authenticatedFetch('/api/user-profile')
                    if (res.ok) {
                        const apiData = await res.json()
                        if (apiData.success && apiData.user) {
                            companyUser = apiData.user
                        }
                    }
                } catch {}
            }
            if (!companyUser) throw new Error("No company found")

            // RPC Call
            const { data, error } = await supabase.rpc('create_dispatcher_account', {
                email: formData.email,
                password: formData.password,
                full_name: formData.name,
                company_id: companyUser.company_id,
                permissions: formData.permissions
            })



            if (error) throw error
            if (data && !data.success) throw new Error(data.error || "Failed to create dispatcher")

            toast({
                title: 'Dispatcher Created!',
                description: `Successfully created account for ${formData.email}`,
                type: 'success'
            })

            setIsAddOpen(false)
            setFormData({ name: '', email: '', password: '', permissions: { view_orders: true, view_drivers: true } })
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

    /* 
     * PERMISSIONS TOGGLE
     * (Normally we'd have a separate edit modal, but for speed, let's just create logic.
     *  For now, permissions are set on create. Updating them would require an update API or direct DB call.)
     */

    // LOADING SKELETON
    if (isLoading) {
        return (
            <div className="p-6 max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <Skeleton className="h-8 w-48 mb-2" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-10 w-32" />
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="border rounded-xl p-6 bg-card space-y-4">
                            <div className="flex justify-between items-center">
                                <Skeleton className="h-6 w-32" />
                                <Skeleton className="h-5 w-16 rounded-full" />
                            </div>
                            <Skeleton className="h-4 w-48" />
                            <div className="space-y-2 pt-4">
                                <Skeleton className="h-3 w-20" />
                                <div className="flex gap-2">
                                    <Skeleton className="h-5 w-16" />
                                    <Skeleton className="h-5 w-24" />
                                </div>
                            </div>
                            <div className="pt-4 flex gap-2">
                                <Skeleton className="h-8 flex-1" />
                                <Skeleton className="h-8 w-8" />
                                <Skeleton className="h-8 w-8" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <PullToRefresh onRefresh={fetchDispatchers}>
        <div className="p-6 max-w-7xl mx-auto space-y-6 pb-4 safe-area-pt">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Dispatch Team</h1>
                    <p className="text-slate-500">Manage dispatchers and their access limits.</p>
                </div>
                <Sheet open={isAddOpen} onOpenChange={(open) => {
                    setIsAddOpen(open)
                    if (!open) {
                        setEditingDispatcher(null)
                        setFormData({ name: '', email: '', password: '', permissions: { view_orders: true, view_drivers: true } })
                    }
                }}>
                    <SheetTrigger asChild>
                        <Button className="gap-2"><Plus size={16} /> Add Dispatcher</Button>
                    </SheetTrigger>
                    <SheetContent className="overflow-y-auto w-full sm:max-w-md safe-area-pt">
                        <SheetHeader>
                            <SheetTitle>{editingDispatcher ? 'Edit Dispatcher' : 'Add New Dispatcher'}</SheetTitle>
                        </SheetHeader>
                        <div className="space-y-4 mt-6">
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
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Password {editingDispatcher && '(Leave blank to keep current)'}</label>
                                <PasswordInput
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    placeholder={editingDispatcher ? "••••••••" : "Create password"}
                                />
                            </div>

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

                            <Button onClick={handleSubmit} className="w-full mt-4" disabled={isSubmitting}>
                                {isSubmitting ? 'Saving...' : (editingDispatcher ? 'Save Changes' : 'Create Account')}
                            </Button>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {dispatchers.length === 0 && (
                    <div className="col-span-full text-center py-12 border-2 border-dashed rounded-xl text-slate-400">
                        No dispatchers found.
                    </div>
                )}

                {dispatchers.map(dispatcher => (
                    <Card key={dispatcher.id} className={dispatcher.status === 'suspended' ? 'opacity-70 bg-slate-50' : ''}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <UserCog size={18} className="text-blue-600" />
                                {dispatcher.full_name}
                            </CardTitle>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold border ${dispatcher.status === 'suspended' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                                {dispatcher.status || 'active'}
                            </span>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-slate-500 mb-4">{dispatcher.email}</div>

                            <div className="space-y-1 mb-4">
                                <p className="text-xs font-bold uppercase text-slate-400">Permissions:</p>
                                <div className="flex flex-wrap gap-1">
                                    {Object.entries(dispatcher.permissions || {}).map(([key, val]) => (
                                        val && <span key={key} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{key.replace('_', ' ')}</span>
                                    ))}
                                    {Object.keys(dispatcher.permissions || {}).length === 0 && <span className="text-xs italic text-red-500">Read Only</span>}
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2 border-t mt-auto">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={`flex-1 ${dispatcher.status === 'suspended' ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'}`}
                                    onClick={() => toggleStatus(dispatcher)}
                                >
                                    {dispatcher.status === 'suspended' ? <Unlock size={14} className="mr-1" /> : <Lock size={14} className="mr-1" />}
                                    {dispatcher.status === 'suspended' ? 'Unfreeze' : 'Freeze'}
                                </Button>

                                <Button variant="outline" size="sm" onClick={() => openEdit(dispatcher)}>
                                    <UserCog size={14} />
                                </Button>

                                <Button variant="destructive" size="sm" onClick={() => initiateDelete(dispatcher)}>
                                    <Trash2 size={14} />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

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
