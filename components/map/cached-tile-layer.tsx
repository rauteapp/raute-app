"use client"

import { useEffect } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import { Capacitor } from "@capacitor/core"
import { getCachedTile, cacheTile } from "@/lib/offline-cache"

interface CachedTileLayerProps {
    url: string
    attribution?: string
}

/**
 * Custom TileLayer that caches tiles in IndexedDB on native platforms.
 * On web, the service worker handles tile caching, so this falls back
 * to a standard TileLayer.
 */
export default function CachedTileLayer({ url, attribution }: CachedTileLayerProps) {
    const map = useMap()

    useEffect(() => {
        if (!map) return

        const isNative = Capacitor.isNativePlatform()

        let tileLayer: L.TileLayer

        if (isNative) {
            // On native: use custom tile layer with IDB caching
            const CachingTileLayer = L.TileLayer.extend({
                createTile: function (coords: L.Coords, done: L.DoneCallback) {
                    const tile = document.createElement('img')
                    const tileUrl = this.getTileUrl(coords)

                    // Try IDB cache first
                    getCachedTile(tileUrl).then((cachedBlob) => {
                        if (cachedBlob) {
                            tile.src = URL.createObjectURL(cachedBlob)
                            done(undefined, tile)
                        } else {
                            // Fetch from network and cache
                            fetch(tileUrl)
                                .then(res => {
                                    if (!res.ok) throw new Error('Tile fetch failed')
                                    return res.blob()
                                })
                                .then(blob => {
                                    cacheTile(tileUrl, blob).catch(() => {})
                                    tile.src = URL.createObjectURL(blob)
                                    done(undefined, tile)
                                })
                                .catch(() => {
                                    // Tile unavailable offline — show grey placeholder
                                    tile.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg=='
                                    done(undefined, tile)
                                })
                        }
                    }).catch(() => {
                        // IDB error — fall back to standard fetch
                        tile.src = tileUrl
                        tile.onload = () => done(undefined, tile)
                        tile.onerror = () => done(new Error('Tile load error'), tile)
                    })

                    return tile
                }
            })

            tileLayer = new (CachingTileLayer as any)(url, {
                attribution: attribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }) as L.TileLayer
        } else {
            // On web: standard TileLayer (service worker handles caching)
            tileLayer = L.tileLayer(url, {
                attribution: attribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            })
        }

        tileLayer.addTo(map)

        return () => {
            map.removeLayer(tileLayer)
        }
    }, [map, url, attribution])

    return null
}
