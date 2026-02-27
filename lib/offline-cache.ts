import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { Capacitor } from '@capacitor/core'

// ============================================
// IndexedDB Offline Cache Layer
// ============================================
// Provides offline data access for orders, drivers, hubs, and map tiles.
// Works on both web and Capacitor (iOS/Android).

interface RauteDB extends DBSchema {
    orders: {
        key: string
        value: any
        indexes: {
            'by-company': string
            'by-driver': string
            'by-status': string
        }
    }
    drivers: {
        key: string
        value: any
        indexes: { 'by-company': string }
    }
    hubs: {
        key: string
        value: any
        indexes: { 'by-company': string }
    }
    user: {
        key: string
        value: any
    }
    meta: {
        key: string
        value: { key: string; value: any; updatedAt: number }
    }
    tiles: {
        key: string
        value: { url: string; blob: Blob; cachedAt: number }
    }
    pod_queue: {
        key: string
        value: { orderId: string; imageBlob: Blob; timestamp: number; retryCount: number }
    }
}

let dbPromise: Promise<IDBPDatabase<RauteDB>> | null = null

function getDB(): Promise<IDBPDatabase<RauteDB>> {
    if (!dbPromise) {
        dbPromise = openDB<RauteDB>('raute-offline', 1, {
            upgrade(db) {
                // Orders store
                if (!db.objectStoreNames.contains('orders')) {
                    const orderStore = db.createObjectStore('orders', { keyPath: 'id' })
                    orderStore.createIndex('by-company', 'company_id')
                    orderStore.createIndex('by-driver', 'driver_id')
                    orderStore.createIndex('by-status', 'status')
                }
                // Drivers store
                if (!db.objectStoreNames.contains('drivers')) {
                    const driverStore = db.createObjectStore('drivers', { keyPath: 'id' })
                    driverStore.createIndex('by-company', 'company_id')
                }
                // Hubs store
                if (!db.objectStoreNames.contains('hubs')) {
                    const hubStore = db.createObjectStore('hubs', { keyPath: 'id' })
                    hubStore.createIndex('by-company', 'company_id')
                }
                // User profile (single record)
                if (!db.objectStoreNames.contains('user')) {
                    db.createObjectStore('user', { keyPath: 'id' })
                }
                // Meta store (sync timestamps, etc)
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' })
                }
                // Map tile cache
                if (!db.objectStoreNames.contains('tiles')) {
                    db.createObjectStore('tiles', { keyPath: 'url' })
                }
                // POD image queue (replaces localStorage)
                if (!db.objectStoreNames.contains('pod_queue')) {
                    db.createObjectStore('pod_queue', { keyPath: 'orderId' })
                }
            },
        })
    }
    return dbPromise
}

// Check if online (works on both web and Capacitor)
async function isOnline(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false
    if (Capacitor.isNativePlatform()) {
        try {
            const { Network } = await import('@capacitor/network')
            const status = await Network.getStatus()
            return status.connected
        } catch {
            return navigator.onLine
        }
    }
    return navigator.onLine
}

// ============================================
// Core cache functions
// ============================================

type StoreName = 'orders' | 'drivers' | 'hubs' | 'user'

/**
 * Fetch data with IDB cache fallback.
 * Online: fetch from Supabase, cache to IDB, return fresh data.
 * Offline/error: return cached data from IDB.
 */
export async function cachedQuery<T extends { id: string }>(
    storeName: StoreName,
    supabaseQuery: () => Promise<{ data: T[] | null; error: any }>,
    options?: {
        filter?: (item: T) => boolean
        indexName?: string
        indexValue?: string
    }
): Promise<{ data: T[]; fromCache: boolean }> {
    const online = await isOnline()

    if (online) {
        try {
            const { data, error } = await supabaseQuery()
            if (error) throw error
            if (data && data.length > 0) {
                // Write to IDB in background (don't await to avoid blocking)
                cacheData(storeName, data).catch(err =>
                    console.warn(`Failed to cache ${storeName}:`, err)
                )
                // Update sync timestamp
                setMeta(`lastSync_${storeName}`, Date.now()).catch(() => { })
            }
            return { data: data || [], fromCache: false }
        } catch (err) {
            console.warn(`Network fetch failed for ${storeName}, falling back to cache:`, err)
            // Fall through to cache
        }
    }

    // Offline or network error — read from IDB
    const cached = await getCachedData<T>(storeName, options)
    return { data: cached, fromCache: true }
}

/**
 * Write an array of records to an IDB store (upsert).
 */
export async function cacheData<T extends { id: string }>(
    storeName: StoreName,
    data: T[]
): Promise<void> {
    const db = await getDB()
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)

    for (const item of data) {
        await store.put(item as any)
    }
    await tx.done
}

/**
 * Read cached data from an IDB store, with optional filtering.
 */
export async function getCachedData<T>(
    storeName: StoreName,
    options?: {
        filter?: (item: T) => boolean
        indexName?: string
        indexValue?: string
    }
): Promise<T[]> {
    try {
        const db = await getDB()
        let results: T[]

        if (options?.indexName && options?.indexValue) {
            results = await (db as any).getAllFromIndex(
                storeName,
                options.indexName,
                options.indexValue
            ) as T[]
        } else {
            results = await db.getAll(storeName as any) as T[]
        }

        if (options?.filter) {
            results = results.filter(options.filter)
        }

        return results
    } catch (err) {
        console.warn(`Failed to read from IDB store ${storeName}:`, err)
        return []
    }
}

/**
 * Write a single record to a store.
 */
export async function cacheSingleRecord<T extends { id: string }>(
    storeName: StoreName,
    record: T
): Promise<void> {
    const db = await getDB()
    await db.put(storeName as any, record as any)
}

/**
 * Delete a single record from a store.
 */
export async function deleteCachedRecord(
    storeName: StoreName,
    id: string
): Promise<void> {
    const db = await getDB()
    await db.delete(storeName as any, id)
}

/**
 * Clear all data from a store.
 */
export async function clearStore(storeName: StoreName | 'tiles' | 'pod_queue'): Promise<void> {
    const db = await getDB()
    await db.clear(storeName as any)
}

// ============================================
// Meta store helpers
// ============================================

export async function getMeta(key: string): Promise<any> {
    const db = await getDB()
    const record = await db.get('meta', key)
    return record?.value
}

export async function setMeta(key: string, value: any): Promise<void> {
    const db = await getDB()
    await db.put('meta', { key, value, updatedAt: Date.now() })
}

// ============================================
// Tile cache (for offline maps)
// ============================================

export async function getCachedTile(url: string): Promise<Blob | null> {
    try {
        const db = await getDB()
        const record = await db.get('tiles', url)
        return record?.blob || null
    } catch {
        return null
    }
}

export async function cacheTile(url: string, blob: Blob): Promise<void> {
    try {
        const db = await getDB()
        await db.put('tiles', { url, blob, cachedAt: Date.now() })
    } catch (err) {
        // Silently fail — tile cache is best-effort
        console.warn('Failed to cache tile:', err)
    }
}

// ============================================
// POD queue (replaces localStorage in pod-queue.ts)
// ============================================

export async function addPODToQueue(orderId: string, imageBlob: Blob): Promise<void> {
    const db = await getDB()
    await db.put('pod_queue', {
        orderId,
        imageBlob,
        timestamp: Date.now(),
        retryCount: 0
    })
}

export async function getPODQueue(): Promise<Array<{ orderId: string; imageBlob: Blob; timestamp: number; retryCount: number }>> {
    const db = await getDB()
    return db.getAll('pod_queue')
}

export async function removePODFromQueue(orderId: string): Promise<void> {
    const db = await getDB()
    await db.delete('pod_queue', orderId)
}

export async function updatePODRetryCount(orderId: string, retryCount: number): Promise<void> {
    const db = await getDB()
    const record = await db.get('pod_queue', orderId)
    if (record) {
        await db.put('pod_queue', { ...record, retryCount })
    }
}

// ============================================
// Utility: get last sync time for a store
// ============================================

export async function getLastSyncTime(storeName: string): Promise<number | null> {
    const ts = await getMeta(`lastSync_${storeName}`)
    return ts || null
}
