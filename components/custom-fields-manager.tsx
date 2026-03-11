"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Eye, EyeOff, GripVertical, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase, type CustomField } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast-provider"
import { useConfirm } from "@/hooks/use-confirm"

interface CustomFieldsManagerProps {
    onFieldsChange?: () => void
    entityType?: 'order' | 'driver'
}

export function CustomFieldsManager({ onFieldsChange, entityType = 'order' }: CustomFieldsManagerProps) {
    const { toast } = useToast()
    const confirm = useConfirm()
    const [customFields, setCustomFields] = useState<CustomField[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAddFieldOpen, setIsAddFieldOpen] = useState(false)

    useEffect(() => {
        fetchCustomFields()
    }, [entityType])

    async function fetchCustomFields() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: userProfile } = await supabase
                .from('users')
                .select('company_id')
                .eq('id', user.id)
                .single()

            if (!userProfile) return

            const { data, error } = await supabase
                .from('custom_fields')
                .select('*')
                .eq('company_id', userProfile.company_id)
                .eq('entity_type', entityType)
                .order('display_order', { ascending: true })

            if (error) throw error
            setCustomFields(data || [])
        } catch (error) {
            console.error('Error fetching custom fields:', error)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleAddField(formData: FormData) {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: userProfile } = await supabase
                .from('users')
                .select('company_id')
                .eq('id', user.id)
                .single()

            if (!userProfile) return

            const fieldType = formData.get('field_type') as string
            const newField = {
                company_id: userProfile.company_id,
                entity_type: entityType,
                field_name: formData.get('field_name') as string,
                field_type: fieldType,
                field_label: formData.get('field_label') as string,
                placeholder: formData.get('placeholder') as string || null,
                options: fieldType === 'select' ? (formData.get('options') as string).split(',').map(o => o.trim()) : null,
                is_required: formData.get('is_required') === 'on',
                driver_visible: formData.get('driver_visible') === 'on',
                display_order: customFields.length
            }

            const { error } = await supabase.from('custom_fields').insert(newField)
            if (error) throw error


            setIsAddFieldOpen(false)
            await fetchCustomFields()
            onFieldsChange?.()
        } catch (error) {
            console.error('Error adding field:', error)
            toast({ title: 'Failed to add field', type: 'error' })
        }
    }

    async function handleDeleteField(fieldId: string) {
        const ok = await confirm({ title: 'Delete custom field', description: 'Are you sure? This will remove this field from all orders.', variant: 'destructive' })
        if (!ok) return

        try {
            const { error } = await supabase.from('custom_fields').delete().eq('id', fieldId)
            if (error) throw error
            await fetchCustomFields()
            onFieldsChange?.()
        } catch (error) {
            console.error('Error deleting field:', error)
            toast({ title: 'Failed to delete field', type: 'error' })
        }
    }

    async function toggleDriverVisibility(field: CustomField) {
        try {
            const { error } = await supabase
                .from('custom_fields')
                .update({ driver_visible: !field.driver_visible })
                .eq('id', field.id)

            if (error) throw error
            await fetchCustomFields()
            onFieldsChange?.()
        } catch (error) {
            console.error('Error updating field:', error)
        }
    }

    return (
        <div className="space-y-6">
            {isLoading ? (
                <div className="p-4 space-y-3 h-32 animate-pulse">
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">Active Fields</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Manage data points collected for each {entityType}</p>
                        </div>
                        {!isAddFieldOpen && (
                            <Button size="sm" onClick={() => setIsAddFieldOpen(true)} className="gap-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 font-bold px-4 h-10 shadow-sm">
                                <Plus size={16} /> Add Field
                            </Button>
                        )}
                    </div>

                    {isAddFieldOpen && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-[24px] border border-slate-200/80 dark:border-slate-800">
                            <form onSubmit={(e) => { e.preventDefault(); handleAddField(new FormData(e.currentTarget)) }} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300">Field Label</label>
                                        <Input name="field_label" placeholder="e.g. Insurance Type" required className="h-11 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300">Field Name (Internal)</label>
                                        <Input name="field_name" placeholder="e.g. insurance_type" pattern="[a-z_]+" required className="h-11 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl font-mono text-sm" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300">Type</label>
                                        <select name="field_type" className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none" required>
                                            <option value="text">Short Text</option>
                                            <option value="textarea">Long Text (Paragraph)</option>
                                            <option value="number">Number</option>
                                            <option value="date">Date picker</option>
                                            <option value="select">Dropdown Menu</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300">Placeholder Text</label>
                                        <Input name="placeholder" placeholder="Enter value..." className="h-11 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300">Dropdown Options (Comma separated)</label>
                                    <Input name="options" placeholder="Option 1, Option 2, Option 3" className="h-11 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl" />
                                    <p className="text-[11px] text-slate-500">Only required if Type is 'Dropdown Menu'.</p>
                                </div>

                                <div className="flex flex-wrap items-center gap-6 pt-2 pb-2">
                                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer group">
                                        <div className="relative flex items-center justify-center">
                                            <input type="checkbox" name="is_required" className="peer sr-only" />
                                            <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 peer-checked:bg-slate-900 peer-checked:border-slate-900 dark:peer-checked:bg-white dark:peer-checked:border-white transition-all"></div>
                                            <svg viewBox="0 0 14 14" fill="none" className="absolute w-3.5 h-3.5 stroke-white dark:stroke-slate-900 opacity-0 peer-checked:opacity-100 transition-opacity">
                                                <path d="M3 8L6 11L11 3.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        Required Field
                                    </label>

                                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer group">
                                        <div className="relative flex items-center justify-center">
                                            <input type="checkbox" name="driver_visible" className="peer sr-only" />
                                            <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all"></div>
                                            <svg viewBox="0 0 14 14" fill="none" className="absolute w-3.5 h-3.5 stroke-white opacity-0 peer-checked:opacity-100 transition-opacity">
                                                <path d="M3 8L6 11L11 3.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        <Eye size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" /> Visible to Drivers
                                    </label>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button type="submit" className="flex-1 h-11 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold hover:bg-slate-800 dark:hover:bg-slate-100">
                                        Create Field
                                    </Button>
                                    <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl font-bold border-slate-200 dark:border-slate-800" onClick={() => setIsAddFieldOpen(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="space-y-3">
                        {customFields.length === 0 && !isAddFieldOpen ? (
                            <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-[24px] border border-dashed border-slate-200 dark:border-slate-800">
                                <Database size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                                <p className="text-base font-bold text-slate-700 dark:text-slate-300">No custom fields</p>
                                <p className="text-sm text-slate-500 dark:text-slate-500 max-w-[250px] mx-auto mt-1">Create custom data points to track specific information for your orders.</p>
                            </div>
                        ) : (
                            customFields.map((field) => (
                                <div key={field.id} className="bg-white dark:bg-slate-900 p-4 rounded-[20px] shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-4 group hover:shadow-md transition-shadow">

                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="cursor-grab p-1.5 -ml-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-300 dark:text-slate-600">
                                            <GripVertical size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <h4 className="font-bold text-[15px] text-slate-900 dark:text-white truncate">{field.field_label}</h4>
                                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-mono rounded-md border border-slate-200 dark:border-slate-700">{field.field_type}</span>
                                                {field.is_required && <span className="px-2 py-0.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold tracking-wide uppercase rounded-md border border-red-100 dark:border-red-900/50">Required</span>}
                                            </div>
                                            <p className="text-[13px] text-slate-500 dark:text-slate-400 font-mono">{field.field_name}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 sm:ml-auto pl-10 sm:pl-0">
                                        <button
                                            onClick={() => toggleDriverVisibility(field)}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all border text-xs font-bold w-full sm:w-auto justify-center",
                                                field.driver_visible
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/50 hover:bg-blue-100'
                                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                            )}
                                            title={field.driver_visible ? 'Visible to drivers' : 'Hidden from drivers'}
                                        >
                                            {field.driver_visible ? <Eye size={14} className="opacity-70" /> : <EyeOff size={14} className="opacity-70" />}
                                            {field.driver_visible ? 'Visible' : 'Hidden'}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteField(field.id)}
                                            className="p-2 w-full sm:w-auto flex justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors shrink-0"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
