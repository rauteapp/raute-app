"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { hapticMedium } from "@/lib/haptics"

export function ThemeToggle() {
    const [mounted, setMounted] = useState(false)
    const { theme, setTheme } = useTheme()

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return <div className="w-12 h-6 bg-slate-200 rounded-full" />
    }

    const isDark = theme === "dark"

    return (
        <button
            onClick={() => { hapticMedium(); setTheme(isDark ? "light" : "dark") }}
            className={`
                relative inline-flex h-6 w-12 items-center rounded-full transition-colors
                ${isDark ? "bg-blue-600" : "bg-slate-300"}
            `}
        >
            <span
                className={`
                    inline-block h-5 w-5 transform rounded-full bg-white transition-transform
                    ${isDark ? "translate-x-6" : "translate-x-1"}
                    flex items-center justify-center
                `}
            >
                {isDark ? (
                    <Moon size={12} className="text-blue-600" />
                ) : (
                    <Sun size={12} className="text-yellow-500" />
                )}
            </span>
        </button>
    )
}
