'use client'

import { Instagram, Twitter, Linkedin, Facebook } from 'lucide-react'
import Link from 'next/link'

export function Footer() {
    return (
        <footer className="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 pt-16 pb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                    {/* Brand */}
                    <div className="md:col-span-1">
                        <div className="relative h-10 w-32 mb-6">
                            <img src="/logo.png" alt="Raute Logo" className="w-full h-full object-contain object-left" />
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
                            The intelligent route planning platform for modern fleets. Optimizing the last mile, one delivery at a time.
                        </p>
                        <div className="flex gap-4">
                            <a href="#" className="text-slate-400 hover:text-blue-600 transition-colors"><Twitter size={20} /></a>
                            <a href="#" className="text-slate-400 hover:text-blue-600 transition-colors"><Linkedin size={20} /></a>
                            <a href="#" className="text-slate-400 hover:text-blue-600 transition-colors"><Instagram size={20} /></a>
                        </div>
                    </div>

                    {/* Links */}
                    <div>
                        <h4 className="font-bold text-slate-900 dark:text-white mb-4">Product</h4>
                        <ul className="space-y-3 text-sm text-slate-500 dark:text-slate-400">
                            <li><a href="#features" className="hover:text-blue-600 transition-colors">Features</a></li>
                            <li><a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a></li>
                            <li><Link href="/login" className="hover:text-blue-600 transition-colors">Driver App</Link></li>
                            <li><Link href="/login" className="hover:text-blue-600 transition-colors">Dashboard</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-900 dark:text-white mb-4">Company</h4>
                        <ul className="space-y-3 text-sm text-slate-500 dark:text-slate-400">
                            <li><a href="#" className="hover:text-blue-600 transition-colors">About Us</a></li>
                            <li><a href="#" className="hover:text-blue-600 transition-colors">Careers</a></li>
                            <li><a href="#" className="hover:text-blue-600 transition-colors">Blog</a></li>
                            <li><a href="#contact" className="hover:text-blue-600 transition-colors">Contact</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-900 dark:text-white mb-4">Legal</h4>
                        <ul className="space-y-3 text-sm text-slate-500 dark:text-slate-400">
                            <li><Link href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link></li>
                            <li><Link href="/terms" className="hover:text-blue-600 transition-colors">Terms of Service</Link></li>
                            <li><Link href="/cookies" className="hover:text-blue-600 transition-colors">Cookie Policy</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-slate-400 text-sm">
                        © {new Date().getFullYear()} Raute. All rights reserved.
                    </p>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        All Systems Operational
                    </div>
                </div>
            </div>
        </footer>
    )
}
