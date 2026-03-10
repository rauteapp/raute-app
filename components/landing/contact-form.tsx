'use client'

import { useState } from 'react'
import { Send, Loader2, Mail, Users, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/toast-provider'

export function ContactForm() {
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        company: '',
        message: ''
    })

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            // Validate
            if (!formData.name || !formData.email || !formData.message) {
                toast({
                    title: "Missing Information",
                    description: "Please fill in all required fields",
                    type: 'error'
                })
                setIsLoading(false)
                return
            }

            // Save to DB + send email notification via API route
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    company: formData.company,
                    message: formData.message,
                }),
            })

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.error || 'Failed to send')
            }

            // Success
            toast({
                title: "Message Sent Successfully!",
                description: "We'll get back to you shortly.",
                type: 'success'
            })
            setFormData({ name: '', email: '', company: '', message: '' }) // Reset

        } catch (error: any) {
            console.error('Submission error:', error)
            toast({
                title: "Failed to send message",
                description: "Please try again or email support@raute.io directly.",
                type: 'error'
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <section id="contact" className="py-24 bg-slate-50 dark:bg-slate-900/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

                    {/* Left Column: Text */}
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-blue-600 dark:text-blue-400 font-semibold tracking-wide uppercase text-sm mb-3">Get in Touch</h2>
                            <h3 className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                                Ready to optimize your fleet?
                            </h3>
                            <p className="text-lg text-slate-600 dark:text-slate-400">
                                Have questions about the platform or need a custom enterprise solution? Our team is ready to help you get started.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <a href="mailto:support@raute.io" className="flex items-start gap-4 group hover:bg-white/50 p-2 rounded-xl transition-colors -mx-2">
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                                    <Mail size={24} />
                                </div>
                                <div>
                                    <h4 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">Email Us</h4>
                                    <span className="text-slate-500 dark:text-slate-400">support@raute.io</span>
                                    <p className="text-xs text-slate-400 mt-1">Typical response within 2 hours</p>
                                </div>
                            </a>

                            <div className="flex items-start gap-4 p-2 -mx-2">
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 text-purple-600 dark:text-purple-400">
                                    <Users size={24} />
                                </div>
                                <div>
                                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">Sales Team</h4>
                                    <p className="text-slate-500 dark:text-slate-400">Custom Enterprise Solutions</p>
                                    <p className="text-xs text-slate-400 mt-1">Available Mon-Fri 9am-6pm EST</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Form */}
                    <div className="bg-white dark:bg-slate-950 p-8 rounded-3xl shadow-lg border border-slate-200 dark:border-slate-800">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name *</label>
                                    <Input
                                        id="name"
                                        placeholder="John Doe"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="rounded-xl border-slate-200 dark:border-slate-800 focus:ring-blue-500"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Work Email *</label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="john@company.com"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="rounded-xl border-slate-200 dark:border-slate-800 focus:ring-blue-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="company" className="text-sm font-medium text-slate-700 dark:text-slate-300">Company Name</label>
                                <Input
                                    id="company"
                                    placeholder="Acme Logistics Inc."
                                    value={formData.company}
                                    onChange={e => setFormData({ ...formData, company: e.target.value })}
                                    className="rounded-xl border-slate-200 dark:border-slate-800 focus:ring-blue-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="message" className="text-sm font-medium text-slate-700 dark:text-slate-300">How can we help? *</label>
                                <Textarea
                                    id="message"
                                    placeholder="I'm interested in the Pro plan for 15 drivers..."
                                    value={formData.message}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, message: e.target.value })}
                                    className="rounded-xl border-slate-200 dark:border-slate-800 focus:ring-blue-500 min-h-[120px]"
                                    required
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 text-lg shadow-lg shadow-blue-500/20"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Sending...
                                    </>
                                ) : (
                                    <>
                                        Send Message <Send className="ml-2 h-5 w-5" />
                                    </>
                                )}
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        </section>
    )
}
