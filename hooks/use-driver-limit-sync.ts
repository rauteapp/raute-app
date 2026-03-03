// ============================================
// REALTIME DRIVER LIMIT SYNC HOOK
// ============================================
// Listens for changes to user's driver_limit and syncs across all sessions

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useDriverLimitSync() {
    const [driverLimit, setDriverLimit] = useState<number>(1)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let channel: any = null

        async function initSync() {
            try {
                // Get current user
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                // Fetch initial limit
                const { data: userData } = await supabase
                    .from('users')
                    .select('driver_limit')
                    .eq('id', user.id)
                    .single()

                if (userData) {
                    setDriverLimit(userData.driver_limit || 1)
                }

                // Subscribe to realtime changes
                channel = supabase
                    .channel(`user_limit_${user.id}`)
                    .on(
                        'postgres_changes',
                        {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'users',
                            filter: `id=eq.${user.id}`
                        },
                        (payload: any) => {
                            const newLimit = payload.new.driver_limit || 1
                            setDriverLimit(newLimit)

                            // Optional: Show toast notification
                            if (typeof window !== 'undefined' && 'Notification' in window) {
                                if (Notification.permission === 'granted') {
                                    new Notification('Subscription Updated', {
                                        body: `Your driver limit is now ${newLimit}`
                                    })
                                }
                            }
                        }
                    )
                    .subscribe()

            } catch (error) {
                console.error('Driver limit sync error:', error)
            } finally {
                setIsLoading(false)
            }
        }

        initSync()

        return () => {
            if (channel) {
                supabase.removeChannel(channel)
            }
        }
    }, [])

    return { driverLimit, isLoading, setDriverLimit }
}
