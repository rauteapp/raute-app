import { supabase } from './supabase';

export type NotificationType =
    | 'order_assigned'
    | 'order_unassigned'
    | 'route_updated'
    | 'delivery_completed'
    | 'driver_offline'
    | 'out_of_range'
    | 'time_window_warning'
    | 'time_window_expired'
    | 'unassigned_urgent';

export const NotificationService = {
    /**
     * Send notification to a specific user (insert DB row + trigger push)
     */
    async notifyUser(
        userId: string,
        companyId: string,
        type: NotificationType,
        title: string,
        body: string,
        data: Record<string, any> = {}
    ) {
        try {
            // Insert in-app notification
            const { error } = await supabase.from('notifications').insert({
                user_id: userId,
                company_id: companyId,
                type,
                title,
                body,
                data,
            });
            if (error) console.error('Failed to insert notification:', error.message);

            // Trigger push notification via Edge Function (fire-and-forget)
            supabase.functions.invoke('send-push-notification', {
                body: { user_id: userId, title, body, data }
            }).catch(err => console.error('Push notification failed:', err));
        } catch (err) {
            console.error('NotificationService.notifyUser error:', err);
        }
    },

    /**
     * Send notification to all managers/admins of a company
     */
    async notifyManagers(
        companyId: string,
        type: NotificationType,
        title: string,
        body: string,
        data: Record<string, any> = {}
    ) {
        try {
            const { data: managers } = await supabase
                .from('users')
                .select('id')
                .eq('company_id', companyId)
                .in('role', ['manager', 'admin', 'company_admin']);

            if (!managers?.length) return;

            await Promise.all(
                managers.map(m =>
                    this.notifyUser(m.id, companyId, type, title, body, data)
                )
            );
        } catch (err) {
            console.error('NotificationService.notifyManagers error:', err);
        }
    },

    /**
     * Send notification to a specific driver by driver ID
     */
    async notifyDriver(
        driverId: string,
        type: NotificationType,
        title: string,
        body: string,
        data: Record<string, any> = {}
    ) {
        try {
            const { data: driver } = await supabase
                .from('drivers')
                .select('user_id, company_id')
                .eq('id', driverId)
                .single();

            if (!driver?.user_id) return;

            await this.notifyUser(driver.user_id, driver.company_id, type, title, body, data);
        } catch (err) {
            console.error('NotificationService.notifyDriver error:', err);
        }
    },
};
