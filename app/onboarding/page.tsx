"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Phone, User, Loader2, CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/components/toast-provider"
import { StyledPhoneInput } from "@/components/ui/styled-phone-input"

export default function OnboardingPage() {
    const router = useRouter()
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [formData, setFormData] = useState({
        fullName: "",
        companyName: "",
        phone: ""
    })

    useEffect(() => {
        checkUser()
    }, [])

    async function checkUser() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.replace("/login")
                return
            }

            // Fetch existing profile data if any
            const { data: profile } = await supabase
                .from('users')
                .select('full_name, phone, company_id')
                .eq('id', user.id)
                .single()

            if (profile?.company_id) {
                // Already onboarded
                router.replace("/dashboard")
                return
            }

            // Pre-fill name from profile or metadata
            const name = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || ""
            const phone = profile?.phone || user.user_metadata?.phone || ""

            setFormData(prev => ({ ...prev, fullName: name, phone: phone }))
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.companyName.trim() || !formData.fullName.trim()) {
            toast({
                title: "Missing Information",
                description: "Company Name and Full Name are required.",
                type: "error"
            })
            return
        }

        setIsSaving(true)

        try {
            const response = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to complete onboarding')
            }

            toast({
                title: "Welcome aboard!",
                description: "Your workspace is ready.",
                type: "success"
            })

            // Use router.push instead of window.location to maintain session state
            router.push("/dashboard")

        } catch (error: any) {
            toast({
                title: "Setup Failed",
                description: error.message,
                type: "error"
            })
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center safe-area-p">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 safe-area-p relative overflow-hidden">
            {/* Background Blobs */}
            <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] bg-blue-100/50 dark:bg-blue-900/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[20%] left-[10%] w-[300px] h-[300px] bg-indigo-100/50 dark:bg-indigo-900/10 rounded-full blur-[80px] pointer-events-none" />

            <Card className="w-full max-w-lg border-0 shadow-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-800 relative z-10">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto h-12 w-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-2">
                        <Building2 size={24} />
                    </div>
                    <CardTitle className="text-2xl font-bold">Setup Your Company</CardTitle>
                    <CardDescription>
                        Complete your profile to access your dashboard.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="John Doe"
                                    className="pl-9 h-11"
                                    value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Company / Business Name</label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Acme Delivery Co."
                                    className="pl-9 h-11"
                                    value={formData.companyName}
                                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                                    required
                                />
                            </div>
                            <p className="text-xs text-slate-500">This will be used for your fleet and invoices.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Phone Number</label>
                            <StyledPhoneInput
                                name="phone"
                                value={formData.phone}
                                onChange={(value) => setFormData({ ...formData, phone: value || '' })}
                                placeholder="Enter your phone number"
                                className="h-11"
                            />
                        </div>

                        <Button type="submit" className="w-full h-11 text-base bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20" disabled={isSaving}>
                            {isSaving ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Setting up...
                                </div>
                            ) : (
                                "Complete Setup"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
