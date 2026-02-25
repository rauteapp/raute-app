'use client'

import { Home, List, MapPin, User, Truck, Route } from 'lucide-react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hapticLight } from '@/lib/haptics'

export function MobileNav() {
    const pathname = usePathname()
    const router = useRouter()
    const [userRole, setUserRole] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/')

    useEffect(() => {
        let mounted = true
        let timeoutId: NodeJS.Timeout

        const fetchRole = async (userId: string, retries = 1) => {
            try {
                // 1. Try Users Table
                let { data: userProfile, error } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', userId)
                    .maybeSingle()

                // 2. Fallback to Drivers Table (Critical for new drivers)
                if (!userProfile?.role) {
                    const { data: driverEntry } = await supabase
                        .from('drivers')
                        .select('id')
                        .eq('user_id', userId)
                        .maybeSingle()

                    if (driverEntry) {
                        // Mock the profile so logic downstream works
                        userProfile = { role: 'driver' } as any
                    }
                }

                if (mounted) {
                    if (userProfile?.role) {
                        setUserRole(userProfile.role)
                        // 🚀 Cache role in localStorage for instant next load
                        if (typeof window !== 'undefined') {
                            localStorage.setItem('raute_user_role', userProfile.role)
                        }
                        setLoading(false)
                    } else if (retries > 0) {
                        // Retry if profile not found yet (race condition on signup/signin)
                        console.warn(`Role not found, retrying... (${retries} left)`)
                        setTimeout(() => fetchRole(userId, retries - 1), 500)
                    } else {
                        // Final failure
                        setLoading(false)
                    }
                }
            } catch (error) {
                console.error('Error fetching role:', error)
                if (mounted) {
                    if (retries > 0) {
                        setTimeout(() => fetchRole(userId, retries - 1), 500)
                    } else {
                        setLoading(false)
                    }
                }
            }
        }

        // Safety timeout: if role fetch takes too long, give up and show UI
        timeoutId = setTimeout(() => {
            if (mounted && loading) {
                console.warn('Role fetch timed out after 5s, showing UI with fallback')
                // Don't set a fallback role - let the UI decide based on available data
                // Setting a default role can show wrong navigation to managers
                setLoading(false)
            }
        }, 5000) // Increased to 5 seconds to give RLS queries more time

        // Auth Logic — with timeout to avoid hanging on navigator.locks
        const checkSession = async () => {
            let userId: string | null = null
            let userMeta: Record<string, any> = {}

            try {
                // getSession() can hang on web due to navigator.locks
                const { data: { session } } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('getSession timeout')), 3000)
                    ),
                ])
                if (session?.user) {
                    userId = session.user.id
                    userMeta = session.user.user_metadata ?? {}
                }
            } catch {
                // getSession timed out or threw — try getUser() as fallback
                console.log('⏳ MobileNav: getSession blocked, trying getUser() fallback...')
                try {
                    const { data: userData } = await supabase.auth.getUser()
                    if (userData.user) {
                        userId = userData.user.id
                        userMeta = userData.user.user_metadata ?? {}
                    }
                } catch {
                    // Both failed
                }
            }

            if (userId) {
                // OPTIMIZATION 1: Check metadata first
                if (userMeta?.role) {
                    setUserRole(userMeta.role)
                    setLoading(false)
                    clearTimeout(timeoutId)
                    return
                }

                // OPTIMIZATION 2: Check localStorage cache
                const cachedRole = typeof window !== 'undefined' ? localStorage.getItem('raute_user_role') : null
                if (cachedRole) {
                    console.log('✅ Using cached role:', cachedRole)
                    setUserRole(cachedRole)
                    setLoading(false)
                    clearTimeout(timeoutId)
                    // Refresh role from DB in background (non-blocking)
                    fetchRole(userId)
                    return
                }

                // OPTIMIZATION 3: Only fetch from DB if no cached role
                fetchRole(userId)
            } else {
                // FALLBACK: Check for custom session (Driver Login)
                const customUserId = typeof window !== 'undefined' ? localStorage.getItem('raute_user_id') : null
                if (customUserId) {
                    fetchRole(customUserId)
                } else {
                    if (mounted) setLoading(false)
                }
            }
        }

        checkSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                await fetchRole(session.user.id)
            } else if (event === 'SIGNED_OUT') {
                setUserRole(null)
            }
        })

        return () => {
            mounted = false
            clearTimeout(timeoutId)
            subscription.unsubscribe()
        }
    }, [])

    // Hide on auth pages, landing page, and verification/activation pages
    const cleanPath = pathname.replace(/\/+$/, '') || '/' // Remove trailing slashes
    const hiddenPaths = ['/login', '/signup', '/', '/verify-email', '/pending-activation', '/privacy', '/terms', '/onboarding', '/forgot-password', '/update-password']
    const isHidden = hiddenPaths.includes(cleanPath) || pathname.includes('/auth')

    if (isHidden) {
        return null
    }

    // Don't show anything while determining role to prevent flickering
    if (loading) return null

    // Don't render nav if we don't have a role yet
    if (!userRole) return null

    const isDriver = userRole === 'driver'
    const isManager = userRole === 'manager' || userRole === 'admin'

    // Safety: If role is loaded but unknown, default to restricted view (Driver-like) 
    // to prevent leaking manager tabs

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-700/50 safe-area-pb transition-colors duration-150">
            <div className={`flex items-center justify-around h-16 max-w-lg mx-auto ${isDriver ? 'px-8' : ''}`}>

                {/* 1. Home / Dashboard (Everyone) */}
                <NavItem
                    href="/dashboard"
                    icon={Home}
                    label="Home"
                    active={isActive('/dashboard')}
                />

                {/* 2. Orders (Everyone) */}
                <NavItem
                    href="/orders"
                    icon={List}
                    label={isDriver ? 'My Orders' : 'Orders'}
                    active={isActive('/orders')}
                />

                {/* 3. Drivers (Managers Only) */}
                {isManager && (
                    <NavItem
                        href="/drivers"
                        icon={Truck}
                        label="Drivers"
                        active={isActive('/drivers')}
                    />
                )}

                {/* 3.5 Planner (Managers Only) */}
                {isManager && (
                    <NavItem
                        href="/planner"
                        icon={Route}
                        label="Planner"
                        active={isActive('/planner')}
                    />
                )}

                {/* 3.6 Dispatchers (Managers Only) */}
                {isManager && (
                    <NavItem
                        href="/dispatchers"
                        icon={User}
                        label="Team"
                        active={isActive('/dispatchers')}
                    />
                )}

                {/* 4. Map (Everyone) */}
                <NavItem
                    href="/map"
                    icon={MapPin}
                    label="Map"
                    active={isActive('/map')}
                />

                {/* 5. Profile (Everyone) */}
                <NavItem
                    href="/profile"
                    icon={User}
                    label="Profile"
                    active={isActive('/profile')}
                />
            </div>
        </div>
    )
}

function NavItem({ href, icon: Icon, label, active }: { href: string, icon: any, label: string, active: boolean }) {
    return (
        <Link
            href={href}
            prefetch={false}
            onClick={() => { if (!active) hapticLight() }}
            className={cn(
                "flex flex-col items-center justify-center gap-0.5 w-full h-full select-none touch-manipulation",
                active
                    ? "text-blue-500 dark:text-blue-400"
                    : "text-slate-400 dark:text-slate-500"
            )}
        >
            <Icon size={22} strokeWidth={active ? 2 : 1.5} />
            <span className={cn("text-[10px] tracking-tight", active ? "font-semibold" : "font-medium")}>{label}</span>
        </Link>
    )
}
