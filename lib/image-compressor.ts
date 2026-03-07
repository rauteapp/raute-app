// ============================================
// IMAGE COMPRESSION UTILITY FOR POD SYSTEM
// ============================================
// Resizes and compresses images to max 1080p before upload
// Optimized for logistics apps to reduce data usage on LTE/5G

export class ImageCompressor {

    /**
     * Maximum dimensions for POD images
     */
    private static readonly MAX_WIDTH = 1920
    private static readonly MAX_HEIGHT = 1080
    private static readonly QUALITY = 0.7 // 70%

    /**
     * Compress image from data URL
     * @param dataUrl - Image data URL from camera
     * @returns Compressed blob ready for upload
     */
    static async compressFromDataUrl(dataUrl: string): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = new Image()

            img.onload = () => {
                try {
                    // Calculate new dimensions (maintain aspect ratio)
                    let { width, height } = this.calculateDimensions(img.width, img.height)

                    // Create canvas
                    const canvas = document.createElement('canvas')
                    canvas.width = width
                    canvas.height = height

                    // Draw and compress
                    const ctx = canvas.getContext('2d')
                    if (!ctx) throw new Error('Canvas context not available')

                    ctx.drawImage(img, 0, 0, width, height)

                    // Convert to blob
                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(blob)
                            } else {
                                reject(new Error('Blob conversion failed'))
                            }
                        },
                        'image/jpeg',
                        this.QUALITY
                    )
                } catch (error) {
                    reject(error)
                }
            }

            img.onerror = () => reject(new Error('Image load failed'))
            img.src = dataUrl
        })
    }

    /**
     * Compress image from Blob (e.g., from Camera API)
     */
    static async compressFromBlob(blob: Blob): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()

            reader.onload = async (e) => {
                try {
                    const dataUrl = e.target?.result as string
                    const compressed = await this.compressFromDataUrl(dataUrl)
                    resolve(compressed)
                } catch (error) {
                    reject(error)
                }
            }

            reader.onerror = () => reject(new Error('File read failed'))
            reader.readAsDataURL(blob)
        })
    }

    /**
     * Calculate new dimensions maintaining aspect ratio
     */
    private static calculateDimensions(originalWidth: number, originalHeight: number): { width: number, height: number } {
        let width = originalWidth
        let height = originalHeight

        // If image exceeds max dimensions, scale down
        if (width > this.MAX_WIDTH || height > this.MAX_HEIGHT) {
            const widthRatio = this.MAX_WIDTH / width
            const heightRatio = this.MAX_HEIGHT / height
            const ratio = Math.min(widthRatio, heightRatio)

            width = Math.floor(width * ratio)
            height = Math.floor(height * ratio)
        }

        return { width, height }
    }

    /**
     * Get estimated compressed size (for UI feedback)
     */
    static estimateCompressedSize(originalWidth: number, originalHeight: number): string {
        const { width, height } = this.calculateDimensions(originalWidth, originalHeight)
        const pixels = width * height
        const estimatedBytes = pixels * 0.3 // Rough estimate: 0.3 bytes per pixel at 70% quality
        const estimatedKB = Math.floor(estimatedBytes / 1024)

        if (estimatedKB > 1024) {
            return `~${(estimatedKB / 1024).toFixed(1)}MB`
        }
        return `~${estimatedKB}KB`
    }
}
