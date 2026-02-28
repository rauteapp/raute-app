'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import "leaflet/dist/leaflet.css"
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search, MapPin } from 'lucide-react'

import { useMapEvents, useMap } from 'react-leaflet'

// Dynamic imports for Leaflet components
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })

interface LocationPickerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelectLocation: (lat: number, lng: number, address: string) => void
    initialLat?: number | null
    initialLng?: number | null
}

function LocationMarker({ position, setPosition }: { position: [number, number] | null, setPosition: (pos: [number, number]) => void }) {
    useMapEvents({
        click(e) {
            setPosition([e.latlng.lat, e.latlng.lng])
        },
    })

    return position ? <Marker position={position} /> : null
}

function MapController({ center }: { center: [number, number] | null }) {
    const map = useMap()
    useEffect(() => {
        if (center) {
            map.flyTo(center, 16, { animate: true, duration: 1.5 })
        }
    }, [center, map])
    return null
}

export function LocationPickerModal({ open, onOpenChange, onSelectLocation, initialLat, initialLng }: LocationPickerProps) {
    const [position, setPosition] = useState<[number, number] | null>(
        initialLat && initialLng ? [initialLat, initialLng] : null
    )
    const [address, setAddress] = useState('')
    const [isGeocoding, setIsGeocoding] = useState(false)

    // Fix leaflet icons
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const L = require('leaflet')
            delete (L.Icon.Default.prototype as any)._getIconUrl
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
                iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            })
        }
    }, [])

    useEffect(() => {
        if (open && initialLat && initialLng) {
            setPosition([initialLat, initialLng])
        }
    }, [open, initialLat, initialLng])

    const handleSave = () => {
        if (position) {
            onSelectLocation(position[0], position[1], address || 'Selected Location')
            onOpenChange(false)
        }
    }

    const handleSearch = async () => {
        if (!address) return
        setIsGeocoding(true)
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
            const data = await res.json()
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat)
                const lon = parseFloat(data[0].lon)
                setPosition([lat, lon])
            }
        } catch (e) {
            console.error('Geocoding error:', e)
        } finally {
            setIsGeocoding(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Select Starting Point</DialogTitle>
                </DialogHeader>

                <div className="flex gap-2 mb-4">
                    <Input
                        placeholder="Search for an address..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Button onClick={handleSearch} disabled={isGeocoding}>
                        {isGeocoding ? 'Searching...' : <Search size={16} />}
                    </Button>
                </div>

                <div className="h-[300px] w-full border rounded-md overflow-hidden relative">
                    <MapContainer
                        center={position || [34.0522, -118.2437]}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <LocationMarker position={position} setPosition={setPosition} />
                        <MapController center={position} />
                    </MapContainer>
                    {!position && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
                            <span className="bg-background px-3 py-1 rounded shadow text-sm font-medium">Click on map to place pin</span>
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-4">
                    <div className="flex-1 flex items-center text-xs text-muted-foreground">
                        {position ? `Selected: ${position[0].toFixed(5)}, ${position[1].toFixed(5)}` : 'No location selected'}
                    </div>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!position}>Confirm Location</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
