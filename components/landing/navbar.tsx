'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, X, ArrowRight, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { ThemeToggle } from '@/components/theme-toggle'

export function Navbar() {
    const [activeSection, setActiveSection] = useState('')
    const [isScrolled, setIsScrolled] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [user, setUser] = useState<any>(null)
    const pathname = usePathname()
    const lastActiveSection = useRef('')

    useEffect(() => {
        if (pathname !== '/') {
            setActiveSection('')
            return
        }

        const handleScroll = () => {
            const scrollY = window.scrollY
            setIsScrolled(scrollY > 20)

            // Scroll Spy
            const sections = ['features', 'how-it-works', 'pricing', 'contact']
            const scrollPosition = scrollY + 100

            // Explicitly handle top of page
            if (scrollY < 100) {
                if (activeSection !== '') {
                    setActiveSection('')
                    lastActiveSection.current = ''
                    window.history.replaceState(null, '', window.location.pathname)
                }
                return
            }

            let currentSection = ''
            for (const section of sections) {
                const element = document.getElementById(section)
                if (element) {
                    const offsetTop = element.offsetTop
                    const offsetHeight = element.offsetHeight

                    if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
                        currentSection = section
                        break
                    }
                }
            }

            if (currentSection !== lastActiveSection.current) {
                lastActiveSection.current = currentSection
                setActiveSection(currentSection)
                if (currentSection) {
                    window.history.replaceState(null, '', `#${currentSection}`)
                }
            }
        }
        window.addEventListener('scroll', handleScroll)

        // Check auth state — use cookie check first for instant detection,
        // then verify with getSession() in background.
        // Do NOT use getUser() — it makes a server call that blocks on
        // _initialize() and fails when the access token is expired after
        // browser restart, causing the "Go to Dashboard" button to disappear.
        const hasAuthCookies = document.cookie
            .split(';')
            .some(c => c.trim().startsWith('sb-') && c.includes('auth-token'))

        if (hasAuthCookies) {
            // Show dashboard button immediately if cookies exist
            setUser({ id: 'cookie-detected' })

            // Verify session in background (non-blocking, with timeout to avoid hanging)
            Promise.race([
                supabase.auth.getSession(),
                new Promise<{ data: { session: null } }>((resolve) =>
                    setTimeout(() => resolve({ data: { session: null } }), 3000)
                ),
            ]).then(({ data }) => {
                if (!data.session) {
                    // Cookies exist but session couldn't be restored — still show
                    // dashboard button because the client-side auth will handle
                    // token refresh when they navigate to dashboard
                }
            }).catch(() => {
                // Ignore errors — cookies exist so user is likely valid
            })
        }

        // Also listen for auth state changes (e.g., user logs in while on landing page)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                setUser(session?.user ?? null)
            } else if (event === 'SIGNED_OUT') {
                setUser(null)
            }
        })

        return () => {
            window.removeEventListener('scroll', handleScroll)
            subscription.unsubscribe()
        }
    }, [activeSection, pathname])

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
            ? 'bg-white/95 dark:bg-slate-950/95 backdrop-blur-md shadow-sm py-2'
            : 'bg-white/50 dark:bg-slate-950/50 backdrop-blur-md py-4'
            }`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between">
                    {/* Logo */}
                    <Link href="/" onClick={(e) => {
                        if (pathname === '/') {
                            e.preventDefault();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            setActiveSection('')
                        }
                    }} className="flex items-center gap-2 cursor-pointer group">
                        <div className="relative h-12 w-40 md:h-14 md:w-48">
                            <img src="/logo.png" alt="Raute Logo" className="w-full h-full object-contain object-left group-hover:opacity-80 transition-opacity" />
                        </div>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-6">
                        {/* Home Button (Only valid if we are NOT on home, or want to scroll top) */}
                        <Link
                            href="/"
                            className={`text-sm font-medium transition-colors flex items-center gap-1 ${pathname === '/'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400'
                                }`}
                        >
                            Home
                        </Link>

                        {['features', 'how-it-works', 'pricing', 'contact'].map((section) => (
                            <Link
                                key={section}
                                href={`/#${section}`}
                                className={`text-sm font-medium transition-colors ${activeSection === section
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400'
                                    }`}
                            >
                                {section === 'how-it-works' ? 'How it works' : section.charAt(0).toUpperCase() + section.slice(1)}
                            </Link>
                        ))}
                    </div>

                    {/* Right Side Actions */}
                    <div className="hidden md:flex items-center gap-4">
                        <ThemeToggle />

                        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

                        {user ? (
                            <Link href="/dashboard">
                                <Button
                                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 shadow-lg shadow-blue-500/20"
                                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                    onContextMenu={(e) => e.preventDefault()}
                                >
                                    Dashboard
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        ) : (
                            <div className="flex items-center gap-3">
                                <Link href="/login">
                                    <Button
                                        variant="ghost"
                                        className="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium"
                                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                        onContextMenu={(e) => e.preventDefault()}
                                    >
                                        Log in
                                    </Button>
                                </Link>
                                <Link href="/signup">
                                    <Button
                                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 shadow-lg shadow-blue-500/20"
                                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                        onContextMenu={(e) => e.preventDefault()}
                                    >
                                        Get Started
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden flex items-center gap-4">
                        <ThemeToggle />
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="text-slate-600 dark:text-slate-300 p-2"
                        >
                            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="md:hidden absolute top-full left-0 right-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 shadow-xl p-4 flex flex-col gap-4 animate-in slide-in-from-top-5">
                    <Link
                        href="/"
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-lg font-medium text-slate-600 dark:text-slate-300 p-2 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg"
                    >
                        Home
                    </Link>
                    {['features', 'how-it-works', 'pricing', 'contact'].map((section) => (
                        <Link
                            key={section}
                            href={`/#${section}`}
                            onClick={() => setMobileMenuOpen(false)}
                            className="text-lg font-medium text-slate-600 dark:text-slate-300 p-2 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg"
                        >
                            {section === 'how-it-works' ? 'How it works' : section.charAt(0).toUpperCase() + section.slice(1)}
                        </Link>
                    ))}
                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
                    {user ? (
                        <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                            <Button
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg"
                                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                onContextMenu={(e) => e.preventDefault()}
                            >
                                Go to Dashboard
                            </Button>
                        </Link>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                                <Button
                                    variant="ghost"
                                    className="w-full justify-start text-lg"
                                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                    onContextMenu={(e) => e.preventDefault()}
                                >
                                    Log in
                                </Button>
                            </Link>
                            <Link href="/signup" onClick={() => setMobileMenuOpen(false)}>
                                <Button
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg"
                                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                                    onContextMenu={(e) => e.preventDefault()}
                                >
                                    Get Started
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </nav>
    )
}
