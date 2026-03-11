'use client'

import { Home, List, MapPin, User, Truck, Route, Settings as SettingsIcon, Users, ChevronRight, Moon, Sparkles, Mail, Crown, LogOut, Lock, Building2 } from 'lucide-react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { hapticLight } from '@/lib/haptics'
import { motion, useAnimationControls } from 'framer-motion'
import { useTheme } from 'next-themes'
import { ThemeToggle } from '@/components/theme-toggle'
import { useToast } from '@/components/toast-provider'
import { markIntentionalLogout } from '@/components/auth-check'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"

export function MobileNav() {
    const pathname = usePathname()
    const router = useRouter()
    const { toast } = useToast()
    const [userRole, setUserRole] = useState<string | null>(null)
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [planName, setPlanName] = useState<string | null>(null)
    const [isTrialActive, setIsTrialActive] = useState(false)
    const [trialDaysRemaining, setTrialDaysRemaining] = useState(0)

    // Security & Logout State
    const [changingPassword, setChangingPassword] = useState(false)
    const [isPasswordSheetOpen, setIsPasswordSheetOpen] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    async function handleChangePassword() {
        if (newPassword !== confirmPassword) {
            toast({ title: '❌ Passwords do not match!', type: 'error' })
            return
        }

        if (newPassword.length < 8) {
            toast({ title: '❌ Password must be at least 8 characters', type: 'error' })
            return
        }

        try {
            setChangingPassword(true)

            const { error } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (error) throw error

            toast({ title: '✅ Password changed successfully!', type: 'success' })
            setNewPassword('')
            setConfirmPassword('')
            setIsPasswordSheetOpen(false)
        } catch (error) {
            toast({ title: 'Error changing password', type: 'error' })
        } finally {
            setChangingPassword(false)
        }
    }

    async function handleLogout() {
        if (!confirm('Are you sure you want to logout?')) return

        try {
            markIntentionalLogout()
            await supabase.auth.signOut()
            setIsMenuOpen(false)
            router.push('/login')
        } catch (error) {
            toast({ title: 'Log out failed', type: 'error' })
            router.push('/login')
        }
    }

    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [barNode, setBarNode] = useState<HTMLDivElement | null>(null)
    const barCallbackRef = useCallback((node: HTMLDivElement | null) => { setBarNode(node) }, [])
    const pillControls = useAnimationControls()
    const isDraggingRef = useRef(false)
    const navigateToTabRef = useRef<(navId: string) => void>(() => { })
    const touchStateRef = useRef<{ x: number; y: number; captured: boolean } | null>(null)
    const prevTouchXRef = useRef(0)
    // Scroll-based minimize
    const [isMinimized, setIsMinimized] = useState(false)
    const lastScrollYRef = useRef(0)
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const minimizeControls = useAnimationControls()
    // Theme
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'

    const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/')

    // Close menu when navigation changes
    useEffect(() => {
        setIsMenuOpen(false)
    }, [pathname])

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

                        // Fetch subscription info for managers
                        if (userProfile.role === 'manager') {
                            // Get trial info
                            const { data: userData } = await supabase
                                .from('users')
                                .select('trial_ends_at')
                                .eq('id', userId)
                                .single()
                            // Get active subscription
                            const { data: sub } = await supabase
                                .from('subscription_history')
                                .select('tier_name')
                                .eq('user_id', userId)
                                .eq('is_active', true)
                                .maybeSingle()

                            if (mounted) {
                                if (sub?.tier_name) {
                                    // Extract friendly name from tier_name (e.g. "raute_starter_monthly" → "Starter")
                                    const name = sub.tier_name.replace(/^(raute_|stripe_)/, '').replace(/_(monthly|annual)$/, '')
                                    setPlanName(name.charAt(0).toUpperCase() + name.slice(1))
                                } else if (userData?.trial_ends_at) {
                                    const trialEnd = new Date(userData.trial_ends_at)
                                    const now = new Date()
                                    const days = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                                    if (days > 0) {
                                        setIsTrialActive(true)
                                        setTrialDaysRemaining(days)
                                    }
                                }
                            }
                        }
                    } else if (retries > 0) {
                        // Retry if profile not found yet (race condition on signup/signin)
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
                    setUserEmail(session.user.email ?? null)
                }
            } catch {
                // getSession timed out or threw — try getUser() as fallback
                try {
                    const { data: userData } = await supabase.auth.getUser()
                    if (userData.user) {
                        userId = userData.user.id
                        userMeta = userData.user.user_metadata ?? {}
                        setUserEmail(userData.user.email ?? null)
                    }
                } catch {
                    // Both failed
                }
            }

            if (userId) {
                // OPTIMIZATION 1: Check metadata first for instant role display
                const cachedRole = userMeta?.role || (typeof window !== 'undefined' ? localStorage.getItem('raute_user_role') : null)
                if (cachedRole) {
                    setUserRole(cachedRole)
                    setLoading(false)
                    clearTimeout(timeoutId)
                }

                // Always fetch from DB to get subscription info (runs in background if role already set)
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

    // Pill measurement — must be before early returns (Rules of Hooks)
    const activeTabId =
        (isMenuOpen || (isActive('/profile') || isActive('/settings') || isActive('/drivers') || isActive('/dispatchers'))) ? 'settings'
            : isActive('/dashboard') ? 'dashboard'
                : isActive('/orders') ? 'orders'
                    : isActive('/planner') ? 'planner'
                        : isActive('/map') ? 'map'
                            : null

    // Keep navigation callback in ref so the touch overlay always has latest closures
    navigateToTabRef.current = (navId: string) => {
        if (navId === 'settings') {
            setIsMenuOpen(prev => !prev)
        } else {
            const routes: Record<string, string> = { dashboard: '/dashboard', orders: '/orders', planner: '/planner', map: '/map' }
            const href = routes[navId]
            if (href && !isActive(href)) {
                router.push(href)
            }
        }
    }

    // Pill positioning — keep positioned at active tab but hidden (only visible during drag)
    useEffect(() => {
        if (isDraggingRef.current || !barNode) return
        if (!activeTabId) { pillControls.set({ opacity: 0, width: 0 }); return }
        const measure = () => {
            const el = barNode.querySelector(`[data-nav-id="${activeTabId}"]`) as HTMLElement
            if (!el) { pillControls.set({ opacity: 0, width: 0 }); return }
            const barRect = barNode.getBoundingClientRect()
            const elRect = el.getBoundingClientRect()
            // Position pill at active tab but keep hidden — it only shows during drag
            pillControls.set({
                x: elRect.left - barRect.left + 4,
                width: elRect.width - 8,
                opacity: 0,
                scaleX: 1,
                scaleY: 1,
            })
        }
        const raf = requestAnimationFrame(measure)
        return () => cancelAnimationFrame(raf)
    }, [activeTabId, pillControls, barNode])

    // --- Touch drag helpers (used by the overlay) ---
    const getNavItems = () => {
        if (!barNode) return []
        const barRect = barNode.getBoundingClientRect()
        return Array.from(barNode.querySelectorAll('[data-nav-id]')).map(el => {
            const rect = (el as HTMLElement).getBoundingClientRect()
            return {
                id: (el as HTMLElement).getAttribute('data-nav-id')!,
                left: rect.left - barRect.left,
                width: rect.width,
                centerX: rect.left + rect.width / 2,
            }
        })
    }

    const interpolatePill = (screenX: number) => {
        const sorted = getNavItems().sort((a, b) => a.centerX - b.centerX)
        if (sorted.length < 2) return sorted.length === 1 ? { x: sorted[0].left + 4, width: sorted[0].width - 8 } : null
        const clamped = Math.max(sorted[0].centerX, Math.min(sorted[sorted.length - 1].centerX, screenX))
        let li = 0
        for (let i = 0; i < sorted.length - 1; i++) {
            if (clamped >= sorted[i].centerX && clamped <= sorted[i + 1].centerX) { li = i; break }
        }
        const L = sorted[li], R = sorted[li + 1]
        const t = (R.centerX - L.centerX) > 0 ? (clamped - L.centerX) / (R.centerX - L.centerX) : 0
        return { x: (L.left + t * (R.left - L.left)) + 4, width: (L.width + t * (R.width - L.width)) - 8 }
    }

    const findClosestTab = (screenX: number) => {
        const items = getNavItems()
        let closest = items[0]
        let minDist = Infinity
        for (const item of items) {
            const d = Math.abs(screenX - item.centerX)
            if (d < minDist) { minDist = d; closest = item }
        }
        return closest
    }

    const handleOverlayTouchStart = (e: React.TouchEvent) => {
        touchStateRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, captured: false }
        prevTouchXRef.current = e.touches[0].clientX
    }

    const handleOverlayTouchMove = (e: React.TouchEvent) => {
        if (!touchStateRef.current) return
        const cx = e.touches[0].clientX
        const dx = cx - touchStateRef.current.x
        const dy = e.touches[0].clientY - touchStateRef.current.y
        if (!touchStateRef.current.captured) {
            if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                touchStateRef.current.captured = true
                isDraggingRef.current = true
                // Fade pill in at start of drag
                pillControls.start({ opacity: 1, transition: { duration: 0.1 } })
            } else return
        }
        // Velocity-based liquid deformation + pill enlargement during drag
        const velocity = cx - prevTouchXRef.current
        prevTouchXRef.current = cx
        const stretchX = 1 + Math.min(Math.abs(velocity) * 0.008, 0.18)
        const velocitySquish = 1 / Math.sqrt(stretchX)
        const scaleYDrag = 1.08 * velocitySquish

        const result = interpolatePill(cx)
        if (result) {
            const DRAG_EXTRA = 28
            pillControls.start({
                x: result.x - DRAG_EXTRA / 2,
                width: result.width + DRAG_EXTRA,
                opacity: 1,
                scaleX: stretchX,
                scaleY: scaleYDrag,
                transition: { type: "spring", stiffness: 800, damping: 35, mass: 0.3 },
            })
        }
    }

    // Visual press feedback on a nav item (DOM class-based since overlay blocks pointer events)
    const triggerPressAnimation = (navId: string) => {
        if (!barNode) return
        const el = barNode.querySelector(`[data-nav-id="${navId}"]`) as HTMLElement
        if (el) {
            el.classList.remove('nav-press')
            void el.offsetWidth // force reflow to restart animation
            el.classList.add('nav-press')
            el.addEventListener('animationend', () => el.classList.remove('nav-press'), { once: true })
        }
    }

    const handleOverlayTouchEnd = (e: React.TouchEvent) => {
        const touch = e.changedTouches[0]

        // If minimized, restore on any tap/touch and don't navigate
        if (isMinimized) {
            setIsMinimized(false)
            minimizeControls.start({ scale: 1, opacity: 1, transition: { duration: 0.2, ease: "easeInOut" } })
            isDraggingRef.current = false
            touchStateRef.current = null
            return
        }

        if (isDraggingRef.current && touchStateRef.current?.captured) {
            const closest = findClosestTab(touch.clientX)
            if (closest) {
                // Snap back then fade out pill
                pillControls.start({
                    x: closest.left + 4,
                    width: closest.width - 8,
                    opacity: 1,
                    scaleX: 1,
                    scaleY: 1,
                    transition: { type: "spring", stiffness: 300, damping: 22 },
                }).then(() => {
                    pillControls.start({ opacity: 0, transition: { duration: 0.2 } })
                })
                hapticLight()
                triggerPressAnimation(closest.id)
                navigateToTabRef.current(closest.id)
            }
            setTimeout(() => { isDraggingRef.current = false }, 100)
        } else {
            // Tap (no drag) — navigate to tapped tab
            const closest = findClosestTab(touch.clientX)
            if (closest) {
                hapticLight()
                triggerPressAnimation(closest.id)
                navigateToTabRef.current(closest.id)
            }
        }
        touchStateRef.current = null
    }

    // Scroll-based minimize behavior (iOS 26 style)
    useEffect(() => {
        const OVERSCROLL_TOLERANCE = 50
        const SCROLL_DOWN_THRESHOLD = 8

        const handleScroll = () => {
            if (isMenuOpen) return
            const currentY = window.scrollY
            const delta = currentY - lastScrollYRef.current
            lastScrollYRef.current = currentY

            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)

            // Near top — always restore
            if (currentY < OVERSCROLL_TOLERANCE) {
                if (isMinimized) {
                    setIsMinimized(false)
                    minimizeControls.start({ scale: 1, opacity: 1, transition: { duration: 0.2, ease: "easeInOut" } })
                }
                return
            }

            if (delta > SCROLL_DOWN_THRESHOLD && !isMinimized) {
                setIsMinimized(true)
                minimizeControls.start({ scale: 0.7, opacity: 0.5, transition: { duration: 0.2, ease: "easeInOut" } })
            } else if (delta < -SCROLL_DOWN_THRESHOLD && isMinimized) {
                setIsMinimized(false)
                minimizeControls.start({ scale: 1, opacity: 1, transition: { duration: 0.2, ease: "easeInOut" } })
            }

            // Auto-restore after scroll stops
            scrollTimeoutRef.current = setTimeout(() => {
                if (isMinimized) {
                    setIsMinimized(false)
                    minimizeControls.start({ scale: 1, opacity: 1, transition: { duration: 0.2, ease: "easeInOut" } })
                }
            }, 300)
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', handleScroll)
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
        }
    }, [isMinimized, isMenuOpen, minimizeControls])

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

    const isMenuContentActive = isActive('/profile') || isActive('/settings') || isActive('/drivers') || isActive('/dispatchers')

    // Safety: If role is loaded but unknown, default to restricted view (Driver-like) 
    // to prevent leaking manager tabs

    return (
        <motion.div
            className="fixed bottom-0 left-0 right-0 z-[10001] flex justify-center px-4 pointer-events-none"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)', transformOrigin: 'center bottom', willChange: 'transform, opacity' }}
            animate={minimizeControls}
        >
            {/* Wrapper for gradient fade positioning */}
            <div className="relative w-full max-w-[450px]">
                {/* Toolbar gradient fade — iOS 26 top bleed (Removed shadow as requested) */}
                <div className="absolute left-4 right-4 pointer-events-none" style={{
                    bottom: '100%', height: 30,
                    background: 'transparent',
                    borderRadius: '2.5rem 2.5rem 0 0',
                }} />

                {/* Glass Container — 4-layer compositing (iOS 26 Liquid Glass) */}
                <div
                    ref={barCallbackRef}
                    className={`pointer-events-auto w-full rounded-[2.5rem] flex items-center justify-around h-[4.5rem] relative overflow-hidden ${isDriver ? 'px-8' : 'px-2'}`}
                    style={{
                        WebkitBackdropFilter: 'blur(12px)',
                        backdropFilter: 'blur(12px)',
                        // Layer 2: Glass tint gradient (systemThinMaterial values)
                        background: isDark
                            ? 'linear-gradient(180deg, rgba(30,30,30,0.50) 0%, rgba(30,30,30,0.60) 40%, rgba(30,30,30,0.50) 70%, rgba(30,30,30,0.00) 100%)'
                            : 'linear-gradient(180deg, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.50) 40%, rgba(255,255,255,0.40) 70%, rgba(255,255,255,0.00) 100%)',
                        // Layer 4: Thin border
                        border: isDark ? '0.5px solid rgba(255,255,255,0.12)' : '0.5px solid rgba(255,255,255,0.50)',
                        boxShadow: isDark
                            ? '0 8px 32px -8px rgba(0,0,0,0.4), 0 2px 8px -2px rgba(0,0,0,0.2)'
                            : '0 8px 32px -8px rgba(0,0,0,0.12), 0 2px 8px -2px rgba(0,0,0,0.06)',
                    }}
                >
                    {/* Layer 4b: Top edge highlight — glass surface reflection */}
                    <div className="absolute top-0 left-[10%] right-[10%] h-[0.5px] pointer-events-none" style={{
                        background: isDark
                            ? 'linear-gradient(to right, transparent, rgba(255,255,255,0.20), transparent)'
                            : 'linear-gradient(to right, transparent, rgba(255,255,255,0.70), transparent)',
                    }} />

                    {/* Layer 3: Directional frosted glass overlay */}
                    <div className="absolute inset-0 pointer-events-none rounded-[2.5rem]" style={{
                        background: isDark
                            ? 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, transparent 100%)'
                            : 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
                    }} />

                    {/* Liquid Pill — water droplet indicator */}
                    <motion.div
                        className="absolute rounded-[1.25rem] pointer-events-none"
                        initial={{ opacity: 0, width: 0, scaleX: 1, scaleY: 1 }}
                        animate={pillControls}
                        style={{
                            top: 6, bottom: 6, left: 0,
                            background: isDark
                                ? 'radial-gradient(ellipse at 30% 20%, rgba(147,197,253,0.25) 0%, rgba(59,130,246,0.15) 40%, rgba(59,130,246,0.08) 100%)'
                                : 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.95) 0%, rgba(219,234,254,0.7) 40%, rgba(191,219,254,0.4) 100%)',
                            border: isDark ? '0.5px solid rgba(147,197,253,0.25)' : '1px solid rgba(255,255,255,0.8)',
                            boxShadow: isDark
                                ? 'inset 0 1px 4px rgba(147,197,253,0.15), 0 2px 8px -2px rgba(59,130,246,0.15)'
                                : 'inset 0 2px 6px rgba(255,255,255,0.9), inset 0 -2px 4px rgba(147,197,253,0.2), 0 4px 16px -4px rgba(59,130,246,0.2), 0 1px 3px rgba(59,130,246,0.08)',
                        }}
                    >
                        {/* Inner highlight — light refraction on glass surface */}
                        <div className="absolute top-[3px] left-[20%] right-[20%] h-[40%] rounded-full" style={{
                            background: isDark
                                ? 'linear-gradient(to bottom, rgba(147,197,253,0.15), transparent)'
                                : 'linear-gradient(to bottom, rgba(255,255,255,0.80), transparent)',
                        }} />
                    </motion.div>

                    {/* Touch overlay — captures all gestures for drag + tap */}
                    <div
                        className="absolute inset-0 z-30 touch-none"
                        aria-hidden="true"
                        onTouchStart={handleOverlayTouchStart}
                        onTouchMove={handleOverlayTouchMove}
                        onTouchEnd={handleOverlayTouchEnd}
                        onClick={(e) => {
                            // Desktop mouse click support
                            const closest = findClosestTab(e.clientX)
                            if (closest) {
                                triggerPressAnimation(closest.id)
                                navigateToTabRef.current(closest.id)
                            }
                        }}
                        style={{ cursor: 'pointer' }}
                    />

                    {/* 1. Home / Dashboard (Everyone) */}
                    <NavItem
                        href="/dashboard"
                        icon={Home}
                        label="Home"
                        navId="dashboard"
                        active={!isMenuOpen && !isMenuContentActive && isActive('/dashboard')}
                        isDark={isDark}
                    />

                    {/* 2. Orders (Everyone) */}
                    <NavItem
                        href="/orders"
                        icon={List}
                        label={isDriver ? 'My Orders' : 'Orders'}
                        navId="orders"
                        active={!isMenuOpen && !isMenuContentActive && isActive('/orders')}
                        isDark={isDark}
                    />

                    {/* 3. Planner (Managers Only) */}
                    {isManager && (
                        <NavItem
                            href="/planner"
                            icon={Route}
                            label="Planner"
                            navId="planner"
                            active={!isMenuOpen && !isMenuContentActive && isActive('/planner')}
                            isDark={isDark}
                        />
                    )}

                    {/* 4. Map (Everyone) */}
                    <NavItem
                        href="/map"
                        icon={MapPin}
                        label="Map"
                        navId="map"
                        active={!isMenuOpen && !isMenuContentActive && isActive('/map')}
                        isDark={isDark}
                    />

                    {/* 5. Menu (Sheet — controlled via overlay tap/drag) */}
                    <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                        <motion.div
                            data-nav-id="settings"
                            className={cn(
                                "flex flex-col items-center justify-center gap-1 h-[4.25rem] w-[4.5rem] select-none relative group z-10 pointer-events-none",
                                isMenuOpen || isMenuContentActive
                                    ? "text-blue-700 dark:text-blue-300"
                                    : "text-slate-500 dark:text-slate-400"
                            )}
                            animate={{ opacity: (isMenuOpen || isMenuContentActive) ? 1 : 0.6, y: (isMenuOpen || isMenuContentActive) ? -1 : 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                        >
                            {/* Glass background for active settings tab */}
                            {(isMenuOpen || isMenuContentActive) && (
                                <div className="absolute inset-[4px] rounded-2xl" style={{
                                    background: isDark
                                        ? 'radial-gradient(ellipse at 30% 20%, rgba(147,197,253,0.18) 0%, rgba(59,130,246,0.10) 50%, rgba(59,130,246,0.05) 100%)'
                                        : 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.85) 0%, rgba(219,234,254,0.5) 50%, rgba(191,219,254,0.3) 100%)',
                                    border: isDark ? '0.5px solid rgba(147,197,253,0.18)' : '0.5px solid rgba(255,255,255,0.70)',
                                    boxShadow: isDark
                                        ? 'inset 0 1px 3px rgba(147,197,253,0.10), 0 1px 4px -1px rgba(59,130,246,0.10)'
                                        : 'inset 0 1px 4px rgba(255,255,255,0.7), 0 2px 8px -2px rgba(59,130,246,0.12)',
                                }} />
                            )}
                            <SettingsIcon
                                size={isMenuOpen || isMenuContentActive ? 24 : 22}
                                strokeWidth={isMenuOpen || isMenuContentActive ? 2.5 : 2}
                                className={cn(
                                    "transition-all duration-300 relative z-[1]",
                                    isMenuOpen || isMenuContentActive ? "animate-[spin_2s_ease-out]" : ""
                                )}
                            />
                            <span className={cn(
                                "text-[10px] tracking-tight transition-all duration-300 relative z-[1]",
                                isMenuOpen || isMenuContentActive ? "font-bold" : "font-medium"
                            )}>Settings</span>
                        </motion.div>

                        {/* Side Menu Content - iOS Settings Style */}
                        <SheetContent hideClose side="right" className="px-5 pb-32 pt-14 z-[10000] border-l-white/50 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-3xl w-full max-w-full sm:w-[450px] sm:max-w-[450px] h-full overflow-y-auto">

                            {/* Header */}
                            <div className="flex items-center mb-8 px-2">
                                <SheetTitle className="text-2xl font-bold text-slate-900 dark:text-white">
                                    Settings
                                </SheetTitle>
                            </div>

                            <div className="flex flex-col gap-6 max-w-lg mx-auto pb-12">

                                {/* Subscription Banner */}
                                <Link href="/subscribe" onClick={() => setIsMenuOpen(false)} className="block">
                                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border border-slate-700/50 p-6 text-white shadow-lg shadow-black/20 active:scale-[0.98] transition-transform">
                                        {/* Decorative elements */}
                                        <Sparkles className="absolute top-4 right-5 text-blue-400/60 w-5 h-5 animate-pulse" />
                                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl" />

                                        <div className="flex flex-col items-start gap-4 relative z-10">
                                            <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
                                                <Crown className="h-3 w-3" />
                                                {planName ? planName.toUpperCase() + ' PLAN' : 'PREMIUM'}
                                            </div>
                                            <div className="w-full flex items-center justify-between gap-4">
                                                <h3 className="text-lg font-bold leading-tight">
                                                    {planName
                                                        ? <>{planName} Plan<br /><span className="text-white/70 text-sm font-medium">Manage your subscription</span></>
                                                        : isTrialActive
                                                            ? <>Free Trial<br /><span className="text-white/70 text-sm font-medium">{trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'} remaining</span></>
                                                            : <>Upgrade to Pro<br /><span className="text-white/70 text-sm font-medium">Unlock all premium features</span></>
                                                    }
                                                </h3>
                                                <span className="flex-shrink-0 bg-white hover:bg-slate-100 text-slate-900 font-bold px-5 py-2.5 rounded-full text-sm shadow-md">
                                                    {planName ? 'Manage' : 'Upgrade'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>

                                {/* Account Section */}
                                <div className="flex flex-col gap-2">
                                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-4">Account</span>
                                    <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                                        <IOSListItem
                                            icon={Mail}
                                            label="Email"
                                            value={userEmail || 'Loading...'}
                                            hasDivider
                                            copyable={true}
                                        />
                                        <div className="relative">
                                            <Link
                                                href="/subscribe"
                                                onClick={() => setIsMenuOpen(false)}
                                                className="flex items-center px-4 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
                                            >
                                                <div className="text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg mr-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
                                                    <Crown size={18} strokeWidth={2} />
                                                </div>
                                                <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                                                    <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">Plan</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[15px] text-slate-500 dark:text-slate-400">
                                                            {planName
                                                                ? planName
                                                                : isTrialActive
                                                                    ? `Trial · ${trialDaysRemaining}d`
                                                                    : 'Free'}
                                                        </span>
                                                        <ChevronRight size={18} className="text-slate-400/70" />
                                                    </div>
                                                </div>
                                            </Link>
                                        </div>
                                    </div>
                                </div>

                                {/* Features / Main Links */}
                                <div className="flex flex-col gap-2">
                                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-4">General</span>
                                    <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                                        <IOSListLink
                                            href="/profile"
                                            icon={User}
                                            label="Edit Profile"
                                            onClick={() => setIsMenuOpen(false)}
                                            hasDivider
                                        />
                                        <IOSListLink
                                            href="/settings"
                                            icon={SettingsIcon}
                                            label="App Settings"
                                            onClick={() => setIsMenuOpen(false)}
                                            hasDivider
                                        />
                                        <IOSListToggle
                                            icon={Moon}
                                            label="Dark Mode"
                                            hasDivider
                                        >
                                            <ThemeToggle />
                                        </IOSListToggle>
                                        <IOSListButton
                                            icon={Lock}
                                            label="Security"
                                            onClick={() => {
                                                setIsMenuOpen(false)
                                                setIsPasswordSheetOpen(true)
                                            }}
                                            hasDivider
                                        />
                                        <IOSListButton
                                            icon={LogOut}
                                            label="Logout"
                                            onClick={handleLogout}
                                            isDestructive
                                        />
                                    </div>
                                </div>

                                {/* Manager Controls */}
                                {isManager && (
                                    <div className="flex flex-col gap-2">
                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-4">Team Management</span>
                                        <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <IOSListLink
                                                href="/settings"
                                                icon={Building2}
                                                label="Company Settings"
                                                onClick={() => setIsMenuOpen(false)}
                                                hasDivider
                                            />
                                            <IOSListLink
                                                href="/dispatchers"
                                                icon={Users}
                                                label="Team & Dispatchers"
                                                onClick={() => setIsMenuOpen(false)}
                                                hasDivider
                                            />
                                            <IOSListLink
                                                href="/drivers"
                                                icon={Truck}
                                                label="Drivers Overview"
                                                onClick={() => setIsMenuOpen(false)}
                                            />
                                        </div>
                                    </div>
                                )}

                            </div>
                        </SheetContent>
                    </Sheet>

                    {/* Change Password Sheet */}
                    <Sheet open={isPasswordSheetOpen} onOpenChange={setIsPasswordSheetOpen}>
                        <SheetContent side="bottom" className="h-[70vh] overflow-y-auto rounded-t-3xl safe-area-pt z-[10002]">
                            <SheetHeader className="mb-6">
                                <SheetTitle className="text-2xl font-bold text-slate-900 dark:text-white">Change Password</SheetTitle>
                            </SheetHeader>
                            <div className="space-y-5 px-4 pb-12 max-w-lg mx-auto">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-900 dark:text-slate-200">New Password</label>
                                    <Input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Enter new password"
                                        minLength={8}
                                        className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-900 dark:text-slate-200">Confirm Password</label>
                                    <Input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm new password"
                                        minLength={8}
                                        className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                                    />
                                </div>

                                <Button
                                    onClick={handleChangePassword}
                                    disabled={changingPassword || !newPassword || !confirmPassword}
                                    className="w-full h-14 bg-amber-600 hover:bg-amber-700 font-bold text-lg rounded-xl shadow-lg shadow-amber-500/20 mt-4 text-white"
                                >
                                    <Lock size={20} className="mr-2" />
                                    {changingPassword ? 'Updating...' : 'Change Password'}
                                </Button>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </motion.div>
    )
}

function NavItem({ href, icon: Icon, label, active, navId, isDark }: { href: string, icon: any, label: string, active: boolean, navId: string, isDark?: boolean }) {
    return (
        <motion.div
            data-nav-id={navId}
            className={cn(
                "flex flex-col items-center justify-center gap-1 h-[4.25rem] w-[4.5rem] select-none relative group z-10 pointer-events-none",
                active
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-slate-500 dark:text-slate-400"
            )}
            animate={{ opacity: active ? 1 : 0.6, y: active ? -1 : 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
        >
            {/* Glass background for active tab */}
            {active && (
                <div className="absolute inset-[4px] rounded-2xl" style={{
                    background: isDark
                        ? 'radial-gradient(ellipse at 30% 20%, rgba(147,197,253,0.18) 0%, rgba(59,130,246,0.10) 50%, rgba(59,130,246,0.05) 100%)'
                        : 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.85) 0%, rgba(219,234,254,0.5) 50%, rgba(191,219,254,0.3) 100%)',
                    border: isDark ? '0.5px solid rgba(147,197,253,0.18)' : '0.5px solid rgba(255,255,255,0.70)',
                    boxShadow: isDark
                        ? 'inset 0 1px 3px rgba(147,197,253,0.10), 0 1px 4px -1px rgba(59,130,246,0.10)'
                        : 'inset 0 1px 4px rgba(255,255,255,0.7), 0 2px 8px -2px rgba(59,130,246,0.12)',
                }} />
            )}
            <Icon
                size={active ? 24 : 22}
                strokeWidth={active ? 2.5 : 2}
                className="transition-all duration-300 relative z-[1]"
            />
            <span className={cn(
                "text-[10px] tracking-tight transition-all duration-300 relative z-[1]",
                active ? "font-bold" : "font-medium"
            )}>{label}</span>
        </motion.div>
    )
}

function IOSListItem({ icon: Icon, label, value, hasDivider, copyable }: { icon: any, label: string, value?: string, hasDivider?: boolean, copyable?: boolean }) {
    return (
        <div className="relative group">
            <div className="flex items-center px-4 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-default">
                <div className="text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg mr-4">
                    <Icon size={18} strokeWidth={2} />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-2">
                    <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">{label}</span>
                    {value && (
                        <span className="text-[15px] text-slate-500 dark:text-slate-400 truncate ml-4 max-w-[60%]">
                            {value}
                        </span>
                    )}
                </div>
            </div>
            {hasDivider && <div className="h-[1px] bg-slate-100 dark:bg-slate-800 ml-[3.25rem] mr-2" />}
        </div>
    )
}

function IOSListLink({ href, icon: Icon, label, onClick, hasDivider }: { href: string, icon: any, label: string, onClick?: () => void, hasDivider?: boolean }) {
    return (
        <div className="relative">
            <Link
                href={href}
                onClick={onClick}
                className="flex items-center px-4 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
            >
                <div className="text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg mr-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
                    <Icon size={18} strokeWidth={2} />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                    <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">{label}</span>
                    <ChevronRight size={18} className="text-slate-400/70" />
                </div>
            </Link>
            {hasDivider && <div className="h-[1px] bg-slate-100 dark:bg-slate-800 ml-[3.25rem] mr-2" />}
        </div>
    )
}

function IOSListButton({ icon: Icon, label, onClick, hasDivider, isDestructive }: { icon: any, label: string, onClick?: () => void, hasDivider?: boolean, isDestructive?: boolean }) {
    return (
        <div className="relative">
            <button
                onClick={onClick}
                className="w-full flex items-center px-4 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors active:bg-slate-100 dark:active:bg-slate-800 touch-manipulation"
            >
                <div className={cn("p-1.5 rounded-lg mr-4 shadow-sm border", isDestructive ? "text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200/50 dark:border-red-900/50" : "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50")}>
                    <Icon size={18} strokeWidth={2} />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                    <span className={cn("text-[15px] font-medium", isDestructive ? "text-red-600 dark:text-red-500" : "text-slate-800 dark:text-slate-200")}>{label}</span>
                    <ChevronRight size={18} className={cn(isDestructive ? "text-red-400/50" : "text-slate-400/70")} />
                </div>
            </button>
            {hasDivider && <div className="h-[1px] bg-slate-100 dark:bg-slate-800 ml-[3.25rem] mr-2" />}
        </div>
    )
}

function IOSListToggle({ icon: Icon, label, hasDivider, children }: { icon: any, label: string, hasDivider?: boolean, children: React.ReactNode }) {
    return (
        <div className="relative">
            <div className="flex items-center px-4 py-3 bg-white dark:bg-slate-900">
                <div className="text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg mr-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
                    <Icon size={18} strokeWidth={2} />
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                    <span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">{label}</span>
                    {children}
                </div>
            </div>
            {hasDivider && <div className="h-[1px] bg-slate-100 dark:bg-slate-800 ml-[3.25rem] mr-2" />}
        </div>
    )
}
