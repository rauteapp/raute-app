import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { supabase } from './supabase';
import { toast } from '@/lib/toast-utils';
import { cacheSingleRecord, deleteCachedRecord } from '@/lib/offline-cache';

type ActionType = 'UPDATE_ORDER_STATUS' | 'UPDATE_DRIVER_LOCATION' | 'CREATE_ORDER';

type OfflineAction = {
    id: string;
    type: ActionType;
    payload: any;
    timestamp: number;
    localId?: string; // For CREATE_ORDER: temporary client-side ID
}

const STORAGE_KEY = 'offline_queue';

class OfflineManager {
    private queue: OfflineAction[] = [];
    private isOnline: boolean = true;
    private networkListenerHandle: { remove: () => void } | null = null;

    constructor() {
        this.init();
    }

    private async init() {
        const status = await Network.getStatus();
        this.isOnline = status.connected;

        this.networkListenerHandle = await Network.addListener('networkStatusChange', status => {
            this.isOnline = status.connected;
            if (this.isOnline) {
                this.processQueue();
            }
        });

        this.loadQueue();
    }

    public async destroy() {
        if (this.networkListenerHandle) {
            this.networkListenerHandle.remove();
            this.networkListenerHandle = null;
        }
    }

    private async loadQueue() {
        const { value } = await Preferences.get({ key: STORAGE_KEY });
        if (value) {
            this.queue = JSON.parse(value);
        }
    }

    private async saveQueue() {
        await Preferences.set({
            key: STORAGE_KEY,
            value: JSON.stringify(this.queue)
        });
    }

    public getQueueSize(): number {
        return this.queue.length;
    }

    public async queueAction(type: ActionType, payload: any): Promise<string | undefined> {
        if (this.isOnline) {
            await this.executeAction(type, payload);
            return undefined;
        } else {
            const localId = type === 'CREATE_ORDER' ? `local_${crypto.randomUUID()}` : undefined;
            const action: OfflineAction = {
                id: crypto.randomUUID(),
                type,
                payload,
                timestamp: Date.now(),
                localId
            };
            this.queue.push(action);
            await this.saveQueue();

            // For CREATE_ORDER: cache the order locally in IDB for instant UI display
            if (type === 'CREATE_ORDER' && localId) {
                const localOrder = {
                    ...payload.order,
                    id: localId,
                    _pendingSync: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    status: payload.order.status || 'pending'
                };
                await cacheSingleRecord('orders', localOrder);
            }

            // Register Background Sync on web (if supported)
            this.registerBackgroundSync();

            toast({
                title: "You are offline",
                description: "Action saved and will sync when online.",
                type: "warning"
            });

            return localId;
        }
    }

    private async registerBackgroundSync() {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'SyncManager' in window) {
            try {
                const reg = await navigator.serviceWorker.ready;
                await (reg as any).sync.register('offline-queue-sync');
            } catch (err) {
                // Background sync registration failed
            }
        }
    }

    private async executeAction(type: ActionType, payload: any, action?: OfflineAction) {
        try {
            switch (type) {
                case 'UPDATE_ORDER_STATUS': {
                    const { orderId, status, location } = payload;

                    // Conflict detection: check server state before applying
                    if (action) {
                        const { data: current } = await supabase.from('orders')
                            .select('updated_at, status')
                            .eq('id', orderId)
                            .single();

                        if (current && new Date(current.updated_at).getTime() > action.timestamp) {
                            // Server has newer data
                            if (['delivered', 'cancelled'].includes(current.status)) {
                                toast({
                                    title: 'Sync Conflict',
                                    description: `Order was already marked as ${current.status}`,
                                    type: 'warning'
                                });
                                return;
                            }
                        }
                    }

                    await supabase.from('orders').update({
                        status,
                        updated_at: new Date().toISOString()
                    }).eq('id', orderId);

                    if (status === 'delivered') {
                        const updateData: any = {
                            delivered_at: new Date().toISOString()
                        };
                        if (location) {
                            updateData.delivered_lat = location.lat;
                            updateData.delivered_lng = location.lng;
                        }
                        if (payload.outOfRange !== undefined) updateData.was_out_of_range = payload.outOfRange;
                        if (payload.distance !== undefined) updateData.delivery_distance_meters = payload.distance;

                        await supabase.from('orders').update(updateData).eq('id', orderId);
                    }
                    break;
                }

                case 'CREATE_ORDER': {
                    const { order } = payload;
                    // Remove local-only fields before inserting
                    const { _pendingSync, ...cleanOrder } = order;
                    // Remove the local ID — let Supabase generate the real one
                    const { id: localId, ...orderWithoutId } = cleanOrder;

                    const { data, error } = await supabase.from('orders').insert(orderWithoutId).select().single();
                    if (error) throw error;

                    // Update IDB: remove local record, cache the real one
                    if (action?.localId) {
                        await deleteCachedRecord('orders', action.localId);
                    }
                    if (data) {
                        await cacheSingleRecord('orders', data);
                    }
                    break;
                }

                case 'UPDATE_DRIVER_LOCATION':
                    // Handled by separate tracking logic
                    break;
            }
        } catch (error) {
            console.error('Error executing offline action:', error);
            throw error;
        }
    }

    public async processQueue() {
        if (this.queue.length === 0) return;

        toast({ title: "Back Online", description: `Syncing ${this.queue.length} offline action(s)...`, type: "info" });

        const tempQueue = [...this.queue];
        this.queue = [];
        await this.saveQueue();

        let successCount = 0;
        let failCount = 0;

        for (const action of tempQueue) {
            try {
                await this.executeAction(action.type, action.payload, action);
                successCount++;
            } catch (error) {
                console.error('Failed to process offline action:', action, error);
                failCount++;
            }
        }

        if (failCount > 0) {
            toast({ title: "Sync Partial", description: `${successCount} synced, ${failCount} failed.`, type: "warning" });
        } else {
            toast({ title: "Sync Complete", description: `${successCount} action(s) synced.`, type: "success" });
        }
    }
}

export const offlineManager = new OfflineManager();
