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

    addListeners() {
        PushNotifications.addListener('registration', async (token) => {
            console.log('Push registration success');
            // Save token to push_tokens table for ALL user roles (managers, drivers, dispatchers)
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Remove old tokens for this user, then insert the new one
                await supabase
                    .from('push_tokens')
                    .delete()
                    .eq('user_id', user.id);

                const { error } = await supabase
                    .from('push_tokens')
                    .insert({
                        user_id: user.id,
                        token: token.value,
                        platform: Capacitor.getPlatform(),
                        updated_at: new Date().toISOString(),
                    });

                if (error) {
                    console.error('Failed to save push token:', error.message);
                }

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

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push registration error:', JSON.stringify(error));
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            toast({
                title: notification.title || 'New Notification',
                description: notification.body || 'You have a new update',
                type: 'info'
            });
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('Push action performed:', JSON.stringify(notification));
        });
    }
};
