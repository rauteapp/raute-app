"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"

interface SwipeToConfirmProps {
    onConfirm: () => void
    label?: string
    confirmLabel?: string
    disabled?: boolean
    loading?: boolean
    icon?: React.ReactNode
    className?: string
    variant?: "default" | "danger" | "success"
}

export function SwipeToConfirm({
    onConfirm,
    label = "Slide to confirm",
    confirmLabel = "Confirmed!",
    disabled = false,
    loading = false,
    icon,
    className,
    variant = "default",
}: SwipeToConfirmProps) {
    const trackRef = useRef<HTMLDivElement>(null)
    const [dragX, setDragX] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const [confirmed, setConfirmed] = useState(false)
    const [trackWidth, setTrackWidth] = useState(0)
    const startXRef = useRef(0)
    const thumbSize = 56

    useEffect(() => {
        if (trackRef.current) {
            setTrackWidth(trackRef.current.offsetWidth)
        }
    }, [])

    const maxDrag = trackWidth - thumbSize - 8 // 8 for padding

    const variantStyles = {
        default: {
            track: "bg-blue-600",
            thumb: "bg-white text-blue-600",
            text: "text-white/80",
        },
        danger: {
            track: "bg-rose-600",
            thumb: "bg-white text-rose-600",
            text: "text-white/80",
        },
        success: {
            track: "bg-emerald-600",
            thumb: "bg-white text-emerald-600",
            text: "text-white/80",
        },
    }

    const styles = variantStyles[variant]

    const handleStart = useCallback((clientX: number) => {
        if (disabled || loading || confirmed) return
        setIsDragging(true)
        startXRef.current = clientX - dragX
    }, [disabled, loading, confirmed, dragX])

    const handleMove = useCallback((clientX: number) => {
        if (!isDragging) return
        const newX = Math.max(0, Math.min(clientX - startXRef.current, maxDrag))
        setDragX(newX)
    }, [isDragging, maxDrag])

    const handleEnd = useCallback(() => {
        if (!isDragging) return
        setIsDragging(false)

        if (dragX >= maxDrag * 0.85) {
            setDragX(maxDrag)
            setConfirmed(true)
            onConfirm()
            // Reset after animation
            setTimeout(() => {
                setConfirmed(false)
                setDragX(0)
            }, 1500)
        } else {
            setDragX(0)
        }
    }, [isDragging, dragX, maxDrag, onConfirm])

    // Mouse events
    const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX)
    const onMouseMove = useCallback((e: MouseEvent) => handleMove(e.clientX), [handleMove])
    const onMouseUp = useCallback(() => handleEnd(), [handleEnd])

    // Touch events
    const onTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX)
    const onTouchMove = useCallback((e: TouchEvent) => {
        e.preventDefault()
        handleMove(e.touches[0].clientX)
    }, [handleMove])
    const onTouchEnd = useCallback(() => handleEnd(), [handleEnd])

    useEffect(() => {
        if (isDragging) {
            window.addEventListener("mousemove", onMouseMove)
            window.addEventListener("mouseup", onMouseUp)
            window.addEventListener("touchmove", onTouchMove, { passive: false })
            window.addEventListener("touchend", onTouchEnd)
        }
        return () => {
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("mouseup", onMouseUp)
            window.removeEventListener("touchmove", onTouchMove)
            window.removeEventListener("touchend", onTouchEnd)
        }
    }, [isDragging, onMouseMove, onMouseUp, onTouchMove, onTouchEnd])

    const progress = maxDrag > 0 ? dragX / maxDrag : 0

    return (
        <div
            ref={trackRef}
            className={cn(
                "relative h-16 rounded-2xl overflow-hidden select-none touch-none",
                styles.track,
                disabled && "opacity-50 pointer-events-none",
                className
            )}
        >
            {/* Progress fill */}
            <div
                className="absolute inset-0 bg-white/10 origin-left transition-none"
                style={{ transform: `scaleX(${progress})` }}
            />

            {/* Label */}
            <div className={cn(
                "absolute inset-0 flex items-center justify-center font-bold text-[15px] tracking-wide transition-opacity",
                styles.text,
                progress > 0.3 && "opacity-0"
            )}>
                {confirmed ? confirmLabel : label}
            </div>

            {/* Chevrons animation */}
            {!confirmed && !loading && progress < 0.3 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-0.5 animate-pulse">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" className="text-white/40">
                        <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" className="text-white/50">
                        <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" className="text-white/60">
                        <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
            )}

            {/* Thumb */}
            <div
                className={cn(
                    "absolute top-1 left-1 h-[56px] w-[56px] rounded-xl flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing",
                    styles.thumb,
                    !isDragging && !confirmed && "transition-transform duration-300 ease-out"
                )}
                style={{
                    transform: `translateX(${dragX}px)`,
                    transition: isDragging ? "none" : undefined,
                }}
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
            >
                {loading ? (
                    <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                ) : confirmed ? (
                    <svg className="h-7 w-7 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : icon ? (
                    icon
                ) : (
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                )}
            </div>
        </div>
    )
}
