import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { toast } from '@/lib/toast-utils';

export const RevenueCatService = {
    initialized: false,

    async init() {
        if (!Capacitor.isNativePlatform()) return;
        if (this.initialized) return;

        const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY_IOS;
        if (!apiKey) {
            console.error('RevenueCat: Missing API key');
            return;
        }

        try {
            const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');

            await Purchases.setLogLevel({ level: LOG_LEVEL.INFO });
            await Purchases.configure({ apiKey });

            // Link RevenueCat user to Supabase user ID
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await Purchases.logIn({ appUserID: user.id });
                console.log('RevenueCat: Configured and logged in as', user.id);
            } else {
                console.log('RevenueCat: Configured (anonymous)');
            }

            this.initialized = true;
        } catch (err) {
            console.error('RevenueCat: Init failed:', err);
        }
    },

    async getOfferings() {
        if (!Capacitor.isNativePlatform()) return null;

        try {
            const { Purchases } = await import('@revenuecat/purchases-capacitor');
            const offerings = await Purchases.getOfferings();
            return offerings.current ?? null;
        } catch (err) {
            console.error('RevenueCat: Failed to get offerings:', err);
            return null;
        }
    },

    async purchase(pkg: any): Promise<{ success: boolean; newDriverLimit?: number }> {
        if (!Capacitor.isNativePlatform()) {
            return { success: false };
        }

        try {
            const { Purchases, PURCHASES_ERROR_CODE } = await import('@revenuecat/purchases-capacitor');

            try {
                await Purchases.purchasePackage({ aPackage: pkg });
            } catch (purchaseErr: any) {
                // User cancelled — not an error
                if (purchaseErr?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
                    return { success: false };
                }
                throw purchaseErr;
            }

            // Purchase succeeded — poll DB for updated driver_limit
            const newLimit = await this.pollDriverLimit();
            return { success: true, newDriverLimit: newLimit };
        } catch (err: any) {
            console.error('RevenueCat: Purchase failed:', err);
            toast({
                title: 'Purchase Failed',
                description: err?.message || 'Something went wrong. Please try again.',
                type: 'error'
            });
            return { success: false };
        }
    },

    async restorePurchases(): Promise<{ success: boolean; newDriverLimit?: number }> {
        if (!Capacitor.isNativePlatform()) {
            return { success: false };
        }

        try {
            const { Purchases } = await import('@revenuecat/purchases-capacitor');
            await Purchases.restorePurchases();

            const newLimit = await this.pollDriverLimit();
            return { success: true, newDriverLimit: newLimit };
        } catch (err) {
            console.error('RevenueCat: Restore failed:', err);
            return { success: false };
        }
    },

    /**
     * Poll the database for an updated driver_limit after purchase/restore.
     * The webhook updates the DB asynchronously, so we wait for it.
     */
    async pollDriverLimit(): Promise<number | undefined> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return undefined;

        // Get current limit before polling
        const { data: before } = await supabase
            .from('users')
            .select('driver_limit')
            .eq('id', user.id)
            .single();

        const previousLimit = before?.driver_limit || 1;

        // Poll up to 10 times over ~10 seconds
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const { data } = await supabase
                .from('users')
                .select('driver_limit')
                .eq('id', user.id)
                .single();

            if (data?.driver_limit && data.driver_limit !== previousLimit) {
                return data.driver_limit;
            }
        }

        // Timeout — return current value anyway
        const { data: final } = await supabase
            .from('users')
            .select('driver_limit')
            .eq('id', user.id)
            .single();

        return final?.driver_limit || previousLimit;
    }
};
