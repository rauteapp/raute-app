'use client'

import { useState, useEffect, useRef, ReactNode, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Loader2 } from 'lucide-react'

interface PullToRefreshProps {
    onRefresh: () => Promise<void>
    children: ReactNode
    threshold?: number // Distance to trigger refresh (px)
}

function getPageScrollTop(): number {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
}

export function PullToRefresh({ onRefresh, children, threshold = 100 }: PullToRefreshProps) {
    const [refreshing, setRefreshing] = useState(false)
    const [pullDistance, setPullDistance] = useState(0)

    const startY = useRef(0)
    const isPulling = useRef(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const DEAD_ZONE = 15

    const isNative = Capacitor.isNativePlatform()

    const stableOnRefresh = useRef(onRefresh)
    stableOnRefresh.current = onRefresh

    const handleRefresh = useCallback(async () => {
        setRefreshing(true)
        await Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {})
        try {
            await stableOnRefresh.current()
        } catch (error) {
            console.error('Refresh failed:', error)
        } finally {
            setRefreshing(false)
            setPullDistance(0)
        }
    }, [])

    useEffect(() => {
        if (!isNative) return

        const container = containerRef.current
        if (!container) return

        let _startY = 0
        let _isPulling = false
        let _pullDistance = 0
        let _refreshing = false
        let _hapticFired = false

        // Track refreshing state changes
        const refreshingInterval = setInterval(() => {
            // Sync from React state (only for blocking new gestures)
        }, 100)

        const handleTouchStart = (e: TouchEvent) => {
            const scrollTop = getPageScrollTop()
            if (scrollTop <= 0 && !refreshing) {
                _startY = e.touches[0].clientY
                _isPulling = false
                _hapticFired = false
            }
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (refreshing) return

            const scrollTop = getPageScrollTop()
            if (scrollTop > 0) {
                if (_isPulling) {
                    _isPulling = false
                    _pullDistance = 0
                    setPullDistance(0)
                }
                return
            }

            const currentY = e.touches[0].clientY
            const distance = currentY - _startY

            // Only pull DOWN
            if (distance <= 0) {
                if (_isPulling) {
                    _isPulling = false
                    _pullDistance = 0
                    setPullDistance(0)
                }
                return
            }

            // Dead zone
            if (distance < DEAD_ZONE) return

            if (!_isPulling) {
                _isPulling = true
            }

            e.preventDefault()

            const adjustedDistance = distance - DEAD_ZONE
            const rubberBand = Math.min(adjustedDistance * 0.5, threshold * 1.2)
            _pullDistance = rubberBand
            setPullDistance(rubberBand)

            // Haptic at threshold
            if (rubberBand >= threshold && !_hapticFired) {
                _hapticFired = true
                Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
            }
        }

        const handleTouchEnd = () => {
            if (!_isPulling || refreshing) {
                _isPulling = false
                _pullDistance = 0
                setPullDistance(0)
                return
            }

            _isPulling = false

            if (_pullDistance >= threshold) {
                handleRefresh()
            } else {
                _pullDistance = 0
                setPullDistance(0)
            }
        }

        container.addEventListener('touchstart', handleTouchStart, { passive: true })
        container.addEventListener('touchmove', handleTouchMove, { passive: false })
        container.addEventListener('touchend', handleTouchEnd)

        return () => {
            clearInterval(refreshingInterval)
            container.removeEventListener('touchstart', handleTouchStart)
            container.removeEventListener('touchmove', handleTouchMove)
            container.removeEventListener('touchend', handleTouchEnd)
        }
    }, [isNative, refreshing, threshold, handleRefresh])

    const progress = Math.min(pullDistance / threshold, 1)
    const rotation = progress * 360

    // On web, just render children directly
    if (!isNative) {
        return <>{children}</>
    }

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Pull Indicator — fixed at top of viewport */}
            {(pullDistance > 0 || refreshing) && (
                <div
                    className="fixed left-0 right-0 flex items-center justify-center pointer-events-none z-[9998]"
                    style={{
                        top: `calc(env(safe-area-inset-top, 0px) + ${refreshing ? 12 : Math.max(0, pullDistance - 40)}px)`,
                        opacity: refreshing ? 1 : progress,
                        transition: refreshing ? 'top 0.2s ease' : 'none',
                    }}
                >
                    <div className="bg-background/95 backdrop-blur-sm rounded-full p-2 shadow-lg border border-border">
                        <Loader2
                            className="text-primary"
                            size={24}
                            style={{
                                transform: refreshing ? undefined : `rotate(${rotation}deg)`,
                                animation: refreshing ? 'spin 1s linear infinite' : 'none',
                            }}
                        />
                    </div>
                    {!refreshing && progress >= 1 && (
                        <p className="absolute -bottom-5 text-xs text-primary font-bold">Release to refresh</p>
                    )}
                </div>
            )}

            {/* Content — uses transform instead of padding for smooth animation */}
            <div style={{
                transform: refreshing ? 'translateY(60px)' : pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
                transition: refreshing || pullDistance === 0 ? 'transform 0.2s ease' : 'none',
            }}>
                {children}
            </div>
        </div>
    )
}
