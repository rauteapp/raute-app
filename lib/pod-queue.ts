// ============================================
// POD OFFLINE QUEUE UTILITY
// ============================================
// Handles offline POD capture with retry mechanism
// Uses IndexedDB for storage (avoids localStorage quota issues with large images)

import { addPODToQueue, getPODQueue, removePODFromQueue, updatePODRetryCount } from '@/lib/offline-cache'

const MAX_RETRIES = 3

export class PODOfflineQueue {

    /**
     * Add POD to offline queue
     */
    static async addToQueue(orderId: string, imageDataUrl: string): Promise<void> {
        // Convert data URL to blob for efficient IDB storage
        const response = await fetch(imageDataUrl)
        const blob = await response.blob()
        await addPODToQueue(orderId, blob)
        console.log(`📦 POD queued for order ${orderId}`)
    }

    /**
     * Get current queue size
     */
    static async getQueueSize(): Promise<number> {
        const queue = await getPODQueue()
        return queue.length
    }

    /**
     * Process queue (attempt uploads)
     */
    static async processQueue(supabase: any): Promise<{ success: number, failed: number }> {
        const queue = await getPODQueue()
        if (queue.length === 0) return { success: 0, failed: 0 }

        console.log(`📤 Processing ${queue.length} queued PODs...`)

        let successCount = 0
        let failedCount = 0

        for (const pod of queue) {
            try {
                const filename = `proof-${pod.orderId}-${pod.timestamp}.jpg`

                // Attempt upload
                const { data, error } = await supabase.storage
                    .from('proofs')
                    .upload(filename, pod.imageBlob)

                if (error) throw error

                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('proofs')
                    .getPublicUrl(filename)

                // Update order
                await supabase
                    .from('orders')
                    .update({
                        proof_url: publicUrl,
                        status: 'delivered'
                    })
                    .eq('id', pod.orderId)

                console.log(`✅ POD uploaded for order ${pod.orderId}`)
                await removePODFromQueue(pod.orderId)
                successCount++

            } catch (error) {
                console.error(`❌ POD upload failed for order ${pod.orderId}:`, error)

                if (pod.retryCount < MAX_RETRIES) {
                    await updatePODRetryCount(pod.orderId, pod.retryCount + 1)
                } else {
                    console.error(`🚫 POD abandoned after ${MAX_RETRIES} retries: ${pod.orderId}`)
                    await removePODFromQueue(pod.orderId)
                }
                failedCount++
            }
        }

        return { success: successCount, failed: failedCount }
    }

    /**
     * Clear queue
     */
    static async clearQueue(): Promise<void> {
        const queue = await getPODQueue()
        for (const pod of queue) {
            await removePODFromQueue(pod.orderId)
        }
    }
}
