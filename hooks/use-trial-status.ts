'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface TrialStatus {
    isLoading: boolean
    isFrozen: boolean
    isTrialActive: boolean
    daysRemaining: number
    trialEndsAt: Date | null
    hasSubscription: boolean
}

/**
 * Checks trial status for the current user's company.
 * - For managers: checks own trial_ends_at + subscription
 * - For drivers/dispatchers: checks their company's manager's trial status
 * - Freeze applies to ENTIRE company when manager's trial expires
 */
export function useTrialStatus(): TrialStatus {
    const [status, setStatus] = useState<TrialStatus>({
        isLoading: true,
        isFrozen: false,
        isTrialActive: false,
        daysRemaining: 0,
        trialEndsAt: null,
        hasSubscription: false,
    })

    useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null

        async function checkStatus() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setStatus(prev => ({ ...prev, isLoading: false }))
                return
            }

            // Get current user's info
            const { data: currentUser } = await supabase
                .from('users')
                .select('id, role, company_id, trial_ends_at, driver_limit')
                .eq('id', user.id)
                .single()

            if (!currentUser) {
                setStatus(prev => ({ ...prev, isLoading: false }))
                return
            }

            // Find the manager of this company (the one who owns the subscription)
            let managerId = currentUser.id
            let managerTrialEndsAt = currentUser.trial_ends_at
            let managerDriverLimit = currentUser.driver_limit || 5

            if (currentUser.role !== 'manager' && currentUser.company_id) {
                // Look up the company's manager
                const { data: manager } = await supabase
                    .from('users')
                    .select('id, trial_ends_at, driver_limit')
                    .eq('company_id', currentUser.company_id)
                    .eq('role', 'manager')
                    .limit(1)
                    .single()

                if (manager) {
                    managerId = manager.id
                    managerTrialEndsAt = manager.trial_ends_at
                    managerDriverLimit = manager.driver_limit || 5
                }
            }

            // Check if manager has active subscription
            const { data: subData } = await supabase
                .from('subscription_history')
                .select('id')
                .eq('user_id', managerId)
                .eq('is_active', true)
                .limit(1)

            const hasSubscription = (subData && subData.length > 0) || false

            const trialEndsAt = managerTrialEndsAt ? new Date(managerTrialEndsAt) : null
            const now = new Date()
            const isTrialExpired = trialEndsAt ? now > trialEndsAt : false
            const daysRemaining = trialEndsAt
                ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
                : 0

            setStatus({
                isLoading: false,
                isFrozen: isTrialExpired && !hasSubscription,
                isTrialActive: !isTrialExpired && !hasSubscription,
                daysRemaining,
                trialEndsAt,
                hasSubscription,
            })

            // Subscribe to realtime changes on manager's row (unfreeze on purchase)
            channel = supabase
                .channel(`trial_status_${managerId}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'users',
                    filter: `id=eq.${managerId}`,
                }, () => { checkStatus() })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'subscription_history',
                    filter: `user_id=eq.${managerId}`,
                }, () => { checkStatus() })
                .subscribe()
        }

        checkStatus()

        return () => {
            if (channel) supabase.removeChannel(channel)
        }
    }, [])

    return status
}
