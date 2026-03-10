import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';
import { toast } from '@/lib/toast-utils';
import { Capacitor } from '@capacitor/core';

export const PushService = {
    async init() {
        if (!Capacitor.isNativePlatform()) {
            return;
        }

        // Request permission
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.error('User denied push notification permissions');
            return;
        }

        // Register
        await PushNotifications.register();

        this.addListeners();
    },

    _listeners: [] as Array<{ remove: () => void }>,

    async addListeners() {
        // Remove any existing listeners first to prevent duplicates
        await this.removeListeners();

        const regListener = await PushNotifications.addListener('registration', async (token) => {
            console.log('Push registration success');
            // Save token to push_tokens table for ALL user roles (managers, drivers, dispatchers)
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('push_tokens').upsert({
                    user_id: user.id,
                    token: token.value,
                    platform: Capacitor.getPlatform(),
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id,token' });

                // Also update drivers.push_token for backwards compatibility
                const { data: driver } = await supabase
                    .from('drivers')
                    .select('id')
                    .eq('user_id', user.id)
                    .single();

                if (driver) {
                    await supabase
                        .from('drivers')
                        .update({ push_token: token.value, platform: Capacitor.getPlatform() })
                        .eq('id', driver.id);
                }
            }
        });

        const errListener = await PushNotifications.addListener('registrationError', (error) => {
            console.error('Push registration error:', JSON.stringify(error));
        });

        const recvListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push received:', JSON.stringify(notification));
            toast({
                title: notification.title || 'New Notification',
                description: notification.body || 'You have a new update',
                type: 'info'
            });
        });

        const actionListener = await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('Push action performed:', JSON.stringify(notification));
            // Navigate based on notification data
            const data = notification.notification.data;
            if (data?.route) {
                window.location.href = data.route;
            }
        });

        this._listeners = [regListener, errListener, recvListener, actionListener];
    },

    async removeListeners() {
        for (const listener of this._listeners) {
            listener.remove();
        }
        this._listeners = [];
    }
};
