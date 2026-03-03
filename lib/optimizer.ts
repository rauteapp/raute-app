import { Driver, Order } from './supabase'

/**
 * OPTIMIZER CONFIGURATION (US — miles & mph)
 */

// Maximum allowed distance for auto-assignment (in miles)
// Prevents cross-continent assignments
const MAX_ASSIGNMENT_DISTANCE = 1500

// Speed profiles for different distance ranges (mph)
// Short hops (<2mi) are slower due to parking, traffic lights, etc.
// Medium range uses city average, highway segments are faster
const SPEED_PROFILE = {
    shortHop: 10,       // < 2 mi (parking, walking, urban crawl)
    urban: 20,          // 2-10 mi (city driving)
    suburban: 35,       // 10-25 mi (suburban/arterial roads)
    highway: 55,        // > 25 mi (highway/interstate)
}

// Average time spent at each delivery stop (minutes)
const AVERAGE_SERVICE_TIME_MIN = 5

// Default route start hour (8:00 AM) — used when no custom start time is provided
const DEFAULT_ROUTE_START_HOUR = 8

// Stale GPS threshold (minutes) — warn if driver location is older than this
const STALE_GPS_THRESHOLD_MIN = 30

// Driver overload threshold — warn if driver has more orders than this
const OVERLOAD_THRESHOLD = 30

// Road distance multiplier — straight-line distances are ~30% shorter than roads
// This multiplier approximates real road distance from Haversine distance
const ROAD_DISTANCE_FACTOR = 1.35

export type OptimizationStrategy = 'fastest' | 'balanced' | 'efficient'

interface DriverStats {
    driverId: string
    driverName: string
    orderCount: number
    totalDistanceMi: number
    estimatedDurationMin: number
}

interface TimeWindowViolation {
    orderId: string
    orderNumber: string
    windowEnd: string
    estimatedArrival: string
    driverName: string
}

interface StaleGpsDriver {
    driverName: string
    lastUpdate: string
    minutesAgo: number
}

interface OverloadedDriver {
    driverName: string
    orderCount: number
    estimatedHours: number
}

interface DepotReloadSuggestion {
    driverName: string
    splitAfterOrderNumber: string
    ordersBefore: number
    ordersAfter: number
}

interface OptimizationWarnings {
    timeWindowViolations: TimeWindowViolation[]
    staleGpsDrivers: StaleGpsDriver[]
    overloadedDrivers: OverloadedDriver[]
    depotReloadSuggestions: DepotReloadSuggestion[]
}

interface OptimizationResult {
    orders: Order[]
    summary: {
        totalDistance: number
        unassignedCount: number
    }
    driverStats: DriverStats[]
    warnings: OptimizationWarnings
    debug?: any
}

/**
 * Calculates straight-line distance between two points (Haversine) in miles
 */
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959 // Radius of the earth in miles
    const dLat = deg2rad(lat2 - lat1)
    const dLon = deg2rad(lon2 - lon1)
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c // Distance in miles
}

/**
 * Estimates real road distance from straight-line distance (in miles)
 * Uses ROAD_DISTANCE_FACTOR to approximate turns, detours, and road geometry
 */
function getRoadDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return getDistance(lat1, lon1, lat2, lon2) * ROAD_DISTANCE_FACTOR
}

/**
 * Estimates travel time in minutes based on distance-dependent speed profile (mph)
 */
function estimateTravelTimeMin(distanceMi: number): number {
    if (distanceMi <= 0) return 0

    // Use road distance for time estimation
    const roadMi = distanceMi * ROAD_DISTANCE_FACTOR

    let speed: number
    if (roadMi < 2) speed = SPEED_PROFILE.shortHop
    else if (roadMi < 10) speed = SPEED_PROFILE.urban
    else if (roadMi < 25) speed = SPEED_PROFILE.suburban
    else speed = SPEED_PROFILE.highway

    return (roadMi / speed) * 60
}

function deg2rad(deg: number): number {
    return deg * (Math.PI / 180)
}

/**
 * Converts "HH:MM:SS" or "HH:MM" time string to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
    const parts = timeStr.split(':')
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

/**
 * Converts minutes since midnight to "h:mm AM/PM" format
 */
function minutesToTimeStr(minutes: number): string {
    const hrs = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    const period = hrs >= 12 ? 'PM' : 'AM'
    const displayHrs = hrs > 12 ? hrs - 12 : hrs === 0 ? 12 : hrs
    return `${displayHrs}:${mins.toString().padStart(2, '0')} ${period}`
}

/**
 * Time-window-aware insertion sort
 *
 * After the greedy nearest-neighbor + 2-opt builds a distance-optimized route,
 * this function ensures time-windowed orders are placed where they can be met.
 *
 * Algorithm:
 * 1. Separate orders into: time-windowed (sorted by window_end ASC) and flexible
 * 2. Build route by inserting time-windowed orders first at positions that meet their windows
 * 3. Fill remaining positions with flexible orders using nearest-neighbor
 */
function buildTimeWindowAwareRoute(
    orders: Order[],
    startLat: number,
    startLng: number,
    routeStartMin: number
): Order[] {
    if (orders.length === 0) return []

    // Separate pinned, time-windowed, and flexible orders
    const pinned = orders.filter(o => o.is_pinned)
    const withWindow = orders.filter(o => !o.is_pinned && o.time_window_end)
        .sort((a, b) => timeToMinutes(a.time_window_end!) - timeToMinutes(b.time_window_end!))
    const flexible = orders.filter(o => !o.is_pinned && !o.time_window_end)

    // Start with pinned orders at the beginning
    const route: Order[] = [...pinned]

    // Insert time-windowed orders at the best feasible position
    for (const order of withWindow) {
        if (!order.latitude || !order.longitude) {
            route.push(order)
            continue
        }

        const windowEnd = timeToMinutes(order.time_window_end!)
        const windowStart = order.time_window_start ? timeToMinutes(order.time_window_start) : 0

        let bestPos = -1
        let bestCost = Infinity

        // Try each position in the current route
        for (let pos = 0; pos <= route.length; pos++) {
            // Calculate ETA if inserted at this position
            const eta = calculateETAAtPosition(route, pos, order, startLat, startLng, routeStartMin)

            // Check if this position meets the time window
            if (eta <= windowEnd) {
                // Cost = extra distance added by inserting here
                const cost = insertionCost(route, pos, order, startLat, startLng)

                // Prefer positions that are closer to window start (not too early)
                const earlyPenalty = Math.max(0, windowStart - eta) * 0.1

                if (cost + earlyPenalty < bestCost) {
                    bestCost = cost + earlyPenalty
                    bestPos = pos
                }
            }
        }

        if (bestPos >= 0) {
            route.splice(bestPos, 0, order)
        } else {
            // Can't meet window — insert at position that gets closest to window
            let bestLatePos = route.length
            let minLateness = Infinity

            for (let pos = 0; pos <= route.length; pos++) {
                const eta = calculateETAAtPosition(route, pos, order, startLat, startLng, routeStartMin)
                const lateness = eta - windowEnd
                if (lateness < minLateness) {
                    minLateness = lateness
                    bestLatePos = pos
                }
            }
            route.splice(bestLatePos, 0, order)
        }
    }

    // Insert flexible orders using nearest-neighbor into remaining gaps
    let remaining = [...flexible]
    while (remaining.length > 0) {
        // Find best position to insert each remaining order
        let bestOrder = -1
        let bestPos = -1
        let bestCost = Infinity

        for (let oi = 0; oi < remaining.length; oi++) {
            const order = remaining[oi]
            if (!order.latitude || !order.longitude) {
                // No coordinates — append at end
                route.push(order)
                remaining.splice(oi, 1)
                oi--
                continue
            }

            // Try inserting at each position — cheapest insertion
            for (let pos = 0; pos <= route.length; pos++) {
                const cost = insertionCost(route, pos, order, startLat, startLng)
                if (cost < bestCost) {
                    bestCost = cost
                    bestOrder = oi
                    bestPos = pos
                }
            }
        }

        if (bestOrder >= 0 && bestPos >= 0) {
            route.splice(bestPos, 0, remaining[bestOrder])
            remaining.splice(bestOrder, 1)
        } else {
            // Fallback: append remaining
            route.push(...remaining)
            break
        }
    }

    return route
}

/**
 * Calculate ETA (in minutes since midnight) if an order is inserted at a given position
 */
function calculateETAAtPosition(
    route: Order[],
    insertPos: number,
    order: Order,
    startLat: number,
    startLng: number,
    routeStartMin: number
): number {
    let currentTime = routeStartMin
    let prevLat = startLat
    let prevLng = startLng

    for (let i = 0; i <= insertPos; i++) {
        const stop = i === insertPos ? order : route[i]
        if (stop.latitude && stop.longitude) {
            const dist = getDistance(prevLat, prevLng, stop.latitude, stop.longitude)
            currentTime += estimateTravelTimeMin(dist)

            if (i === insertPos) return currentTime

            currentTime += AVERAGE_SERVICE_TIME_MIN
            prevLat = stop.latitude
            prevLng = stop.longitude
        }
    }

    return currentTime
}

/**
 * Calculate the extra distance cost of inserting an order at a given position
 */
function insertionCost(
    route: Order[],
    insertPos: number,
    order: Order,
    startLat: number,
    startLng: number
): number {
    if (!order.latitude || !order.longitude) return Infinity

    const prevLat = insertPos === 0
        ? startLat
        : (route[insertPos - 1]?.latitude || startLat)
    const prevLng = insertPos === 0
        ? startLng
        : (route[insertPos - 1]?.longitude || startLng)

    const nextLat = route[insertPos]?.latitude
    const nextLng = route[insertPos]?.longitude

    // Cost = (prev→order) + (order→next) - (prev→next)
    const distPrevToOrder = getDistance(prevLat, prevLng, order.latitude, order.longitude)

    if (nextLat && nextLng) {
        const distOrderToNext = getDistance(order.latitude, order.longitude, nextLat, nextLng)
        const distPrevToNext = getDistance(prevLat, prevLng, nextLat, nextLng)
        return distPrevToOrder + distOrderToNext - distPrevToNext
    }

    return distPrevToOrder
}

/**
 * MAIN OPTIMIZATION FUNCTION
 *
 * Improved Logic:
 * 1. Filtering: Max Distance Constraint (No assignments > 1500 miles).
 * 2. Scoring: Distance + Load Penalty.
 * 3. Time-Window-Aware Sequencing: Orders reordered to meet delivery windows.
 * 4. 2-Opt + Cheapest Insertion: Better than pure greedy nearest-neighbor.
 * 5. Road Distance Approximation: 1.35x multiplier over straight-line.
 * 6. Dynamic Speed Profile: Speed varies by distance (urban/suburban/highway).
 * 7. Configurable Start Time: No longer hardcoded to 8 AM.
 * 8. Smart Warnings: Stale GPS, driver overload, depot reload suggestions.
 */
export async function optimizeRoute(
    orders: Order[],
    drivers: Driver[],
    strategy: OptimizationStrategy = 'fastest',
    mode: 'morning' | 'reoptimize' = 'morning',
    routeStartHour: number = DEFAULT_ROUTE_START_HOUR
): Promise<OptimizationResult> {

    // In reoptimize mode, always use the CURRENT time (ignore the start hour setting)
    // This makes sense because drivers are already on the road
    if (mode === 'reoptimize') {
        const now = new Date()
        routeStartHour = now.getHours() + now.getMinutes() / 60
    }

    let updatedOrders = [...orders]

    // Warnings collector
    const warnings: OptimizationWarnings = {
        timeWindowViolations: [],
        staleGpsDrivers: [],
        overloadedDrivers: [],
        depotReloadSuggestions: []
    }

    // FILTER: Ignore 'delivered' or 'cancelled' orders from re-assignment
    const activeOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled')

    // 0. Separate Pinned vs Unpinned Orders
    const pinnedOrders = activeOrders.filter(o => o.is_pinned && o.driver_id)
    const unpinnedOrders = activeOrders.filter(o => !pinnedOrders.includes(o))

    // 1. Available Orders (Pinned orders are excluded from optimization pool)
    const availableOrders = unpinnedOrders

    // Pre-Assign Pinned Orders directly
    pinnedOrders.forEach(order => {
        const orderIndex = updatedOrders.findIndex(o => o.id === order.id)
        if (orderIndex !== -1) {
            updatedOrders[orderIndex] = {
                ...updatedOrders[orderIndex],
                is_pinned: true,
                status: 'assigned'
            }
        }
    })

    // Map drivers to their starting positions
    const driverPositions = drivers.map(d => {
        let lat: number | undefined, lng: number | undefined, source: string | undefined, address: string | undefined

        // Priority 1: Manual Start Point (Manager override) -> ALWAYS FIRST
        if (d.use_manual_start && d.starting_point_lat && d.starting_point_lng) {
            lat = d.starting_point_lat
            lng = d.starting_point_lng
            address = d.starting_point_address || 'Manual Start Point'
            source = 'manual'
        }
        // Priority 2: Check Mode
        else if (mode === 'reoptimize') {
            // Mid-Day Mode: Prioritize Live GPS
            if (d.current_lat && d.current_lng) {
                // Check if GPS is stale (>30 min old)
                if (d.last_location_update) {
                    const lastUpdate = new Date(d.last_location_update)
                    const minutesAgo = Math.floor((Date.now() - lastUpdate.getTime()) / 60000)

                    if (minutesAgo > STALE_GPS_THRESHOLD_MIN) {
                        // GPS is stale — warn and try depot fallback
                        warnings.staleGpsDrivers.push({
                            driverName: d.name,
                            lastUpdate: d.last_location_update,
                            minutesAgo
                        })

                        // Prefer depot over stale GPS
                        if (d.default_start_lat && d.default_start_lng) {
                            lat = d.default_start_lat
                            lng = d.default_start_lng
                            address = d.default_start_address || 'Default Depot (GPS stale)'
                            source = 'default'
                        } else {
                            // Use stale GPS as last resort
                            lat = d.current_lat
                            lng = d.current_lng
                            address = `Live Location (${minutesAgo}min old)`
                            source = 'stale'
                        }
                    } else {
                        lat = d.current_lat
                        lng = d.current_lng
                        address = 'Live Location'
                        source = 'live'
                    }
                } else {
                    // No last_location_update timestamp — use GPS but mark as unknown freshness
                    lat = d.current_lat
                    lng = d.current_lng
                    address = 'Live Location'
                    source = 'live'
                }
            }
            // Fallback to Depot
            else if (d.default_start_lat && d.default_start_lng) {
                lat = d.default_start_lat
                lng = d.default_start_lng
                address = d.default_start_address || 'Default Depot'
                source = 'default'
            }
        }
        // Priority 3: Morning Mode (Default) -> Prioritize Depot
        else if (d.default_start_lat && d.default_start_lng) {
            lat = d.default_start_lat
            lng = d.default_start_lng
            address = d.default_start_address || 'Default Depot'
            source = 'default'
        }
        // Priority 4: Live GPS fallback for Morning Mode
        else if (d.current_lat && d.current_lng) {
            lat = d.current_lat
            lng = d.current_lng
            address = 'Live Location'
            source = 'live'
        }
        // Priority 5: Infer from locked orders (Last resort)
        else {
            const driversLockedOrders = pinnedOrders.filter(lo => lo.driver_id === d.id && lo.latitude)
            if (driversLockedOrders.length > 0) {
                lat = driversLockedOrders[0].latitude ?? undefined
                lng = driversLockedOrders[0].longitude ?? undefined
                address = 'Inferred from Orders'
                source = 'inferred'
            }
        }

        return {
            id: d.id,
            name: d.name,
            lat,
            lng,
            address,
            load: pinnedOrders.filter(o => o.driver_id === d.id).length,
            valid: !!(lat && lng),
            source,
            depotLat: d.default_start_lat,
            depotLng: d.default_start_lng
        }
    })

    // Determine Strategy Weights
    let loadBalanceWeight = 10
    if (strategy === 'fastest') loadBalanceWeight = 0.5
    else if (strategy === 'balanced') loadBalanceWeight = 50
    else loadBalanceWeight = 10

    // 2. Assign Available Orders to Nearest Valid Driver (using road distance)
    for (const order of availableOrders) {
        if (!order.latitude || !order.longitude) continue;

        let bestDriverId: string | null = null
        let minScore = Infinity

        for (const driver of driverPositions) {
            if (!driver.valid || !driver.lat || !driver.lng) continue

            const distance = getRoadDistance(driver.lat, driver.lng, order.latitude, order.longitude)

            if (distance > MAX_ASSIGNMENT_DISTANCE) continue

            const loadPenalty = driver.load * loadBalanceWeight
            const totalScore = distance + loadPenalty

            if (totalScore < minScore) {
                minScore = totalScore
                bestDriverId = driver.id
            }
        }

        if (bestDriverId) {
            const orderIndex = updatedOrders.findIndex(o => o.id === order.id)
            if (orderIndex !== -1) {
                updatedOrders[orderIndex] = {
                    ...updatedOrders[orderIndex],
                    driver_id: bestDriverId,
                    status: 'assigned',
                    is_pinned: false
                }

                const driverPos = driverPositions.find(d => d.id === bestDriverId)
                if (driverPos) driverPos.load++
            }
        }
    }

    // 3. Sequence Orders per Driver — Time-Window-Aware
    const finalOrders: Order[] = []
    const driverStats: DriverStats[] = []
    let grandTotalDistance = 0

    for (const driver of drivers) {
        let driverOrders = updatedOrders.filter(o => o.driver_id === driver.id)
        if (driverOrders.length === 0) continue

        const driverPos = driverPositions.find(d => d.id === driver.id)

        // Start point — use optimizer's resolved position
        let startLat = driverPos?.lat || driver.current_lat || driver.default_start_lat
        let startLng = driverPos?.lng || driver.current_lng || driver.default_start_lng

        // If no start point, use first order's location
        if ((!startLat || !startLng) && driverOrders[0].latitude) {
            startLat = driverOrders[0].latitude
            startLng = driverOrders[0].longitude
        }

        // Route start time (routeStartHour can be fractional in reoptimize mode, e.g. 14.5 = 2:30 PM)
        const routeStartMin = Math.round(routeStartHour * 60)

        let sortedDriverOrders: Order[]

        if (startLat && startLng) {
            // Use time-window-aware routing with cheapest insertion
            sortedDriverOrders = buildTimeWindowAwareRoute(
                driverOrders,
                startLat,
                startLng,
                routeStartMin
            )
        } else {
            // No start position — sort by priority
            sortedDriverOrders = [...driverOrders].sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
                if (a.time_window_end && b.time_window_end) {
                    return timeToMinutes(a.time_window_end) - timeToMinutes(b.time_window_end)
                }
                if (a.time_window_end) return -1
                if (b.time_window_end) return 1
                return 0
            })
        }

        // --- POST-PROCESSING: 2-OPT OPTIMIZATION ---
        // Only swap segments that don't violate time windows
        let improvement = true
        let iterations = 0
        const maxIterations = 500

        while (improvement && iterations < maxIterations) {
            improvement = false
            iterations++
            for (let i = 0; i < sortedDriverOrders.length - 2; i++) {
                for (let j = i + 2; j < sortedDriverOrders.length - 1; j++) {
                    const A = sortedDriverOrders[i]
                    const B = sortedDriverOrders[i + 1]
                    const C = sortedDriverOrders[j]
                    const D = sortedDriverOrders[j + 1]

                    if (A.latitude && A.longitude && B.latitude && B.longitude &&
                        C.latitude && C.longitude && D.latitude && D.longitude) {

                        const currentDist = getDistance(A.latitude, A.longitude, B.latitude, B.longitude) +
                            getDistance(C.latitude, C.longitude, D.latitude, D.longitude)

                        const newDist = getDistance(A.latitude, A.longitude, C.latitude, C.longitude) +
                            getDistance(B.latitude, B.longitude, D.latitude, D.longitude)

                        if (newDist < currentDist) {
                            // Check if the swap would violate any time windows
                            const candidateRoute = [...sortedDriverOrders]
                            const segment = candidateRoute.slice(i + 1, j + 1).reverse()
                            candidateRoute.splice(i + 1, segment.length, ...segment)

                            if (!wouldViolateTimeWindows(candidateRoute, startLat!, startLng!, routeStartMin)) {
                                sortedDriverOrders.splice(i + 1, segment.length, ...segment)
                                improvement = true
                            }
                        }
                    }
                }
            }
        }

        // Re-assign correct indices after optimization
        sortedDriverOrders.forEach((o, index) => {
            o.route_index = index + 1
        })

        // --- CALCULATE ROUTE DISTANCE & DURATION (with road distance & dynamic speed) ---
        let routeDistanceMi = 0

        // Distance from start to first order
        if (startLat && startLng && sortedDriverOrders[0]?.latitude && sortedDriverOrders[0]?.longitude) {
            routeDistanceMi += getRoadDistance(startLat, startLng, sortedDriverOrders[0].latitude, sortedDriverOrders[0].longitude)
        }

        // Distance between consecutive orders
        for (let i = 0; i < sortedDriverOrders.length - 1; i++) {
            const curr = sortedDriverOrders[i]
            const next = sortedDriverOrders[i + 1]
            if (curr.latitude && curr.longitude && next.latitude && next.longitude) {
                routeDistanceMi += getRoadDistance(curr.latitude, curr.longitude, next.latitude, next.longitude)
            }
        }

        // Duration uses dynamic speed profile
        let estimatedDurationMin = 0

        // Travel from start to first stop
        if (startLat && startLng && sortedDriverOrders[0]?.latitude && sortedDriverOrders[0]?.longitude) {
            const dist = getDistance(startLat, startLng, sortedDriverOrders[0].latitude, sortedDriverOrders[0].longitude)
            estimatedDurationMin += estimateTravelTimeMin(dist)
        }

        // Travel between stops + service time
        for (let i = 0; i < sortedDriverOrders.length; i++) {
            estimatedDurationMin += AVERAGE_SERVICE_TIME_MIN

            if (i < sortedDriverOrders.length - 1) {
                const curr = sortedDriverOrders[i]
                const next = sortedDriverOrders[i + 1]
                if (curr.latitude && curr.longitude && next.latitude && next.longitude) {
                    const dist = getDistance(curr.latitude, curr.longitude, next.latitude, next.longitude)
                    estimatedDurationMin += estimateTravelTimeMin(dist)
                }
            }
        }

        grandTotalDistance += routeDistanceMi

        driverStats.push({
            driverId: driver.id,
            driverName: driver.name,
            orderCount: sortedDriverOrders.length,
            totalDistanceMi: Math.round(routeDistanceMi * 10) / 10,
            estimatedDurationMin: Math.round(estimatedDurationMin)
        })

        // --- TIME WINDOW VIOLATION DETECTION ---
        let currentTimeMin = routeStartMin

        // Travel time from start to first stop
        if (startLat && startLng && sortedDriverOrders[0]?.latitude && sortedDriverOrders[0]?.longitude) {
            const dist = getDistance(startLat, startLng, sortedDriverOrders[0].latitude, sortedDriverOrders[0].longitude)
            currentTimeMin += estimateTravelTimeMin(dist)
        }

        for (let i = 0; i < sortedDriverOrders.length; i++) {
            const order = sortedDriverOrders[i]

            // If arriving before window start, wait until window opens
            if (order.time_window_start) {
                const windowStartMin = timeToMinutes(order.time_window_start)
                if (currentTimeMin < windowStartMin) {
                    currentTimeMin = windowStartMin // Wait for window to open
                }
            }

            // Check if arrival time violates the time window
            if (order.time_window_end) {
                const windowEndMin = timeToMinutes(order.time_window_end)
                if (currentTimeMin > windowEndMin) {
                    warnings.timeWindowViolations.push({
                        orderId: order.id,
                        orderNumber: order.order_number || order.id,
                        windowEnd: order.time_window_end.slice(0, 5),
                        estimatedArrival: minutesToTimeStr(currentTimeMin),
                        driverName: driver.name
                    })
                }
            }

            // Add service time
            currentTimeMin += AVERAGE_SERVICE_TIME_MIN

            // Add travel time to next stop
            if (i < sortedDriverOrders.length - 1) {
                const next = sortedDriverOrders[i + 1]
                if (order.latitude && order.longitude && next.latitude && next.longitude) {
                    const dist = getDistance(order.latitude, order.longitude, next.latitude, next.longitude)
                    currentTimeMin += estimateTravelTimeMin(dist)
                }
            }
        }

        // --- OVERLOAD WARNING ---
        if (sortedDriverOrders.length > OVERLOAD_THRESHOLD) {
            warnings.overloadedDrivers.push({
                driverName: driver.name,
                orderCount: sortedDriverOrders.length,
                estimatedHours: Math.round(estimatedDurationMin / 60 * 10) / 10
            })

            // --- DEPOT RELOAD SUGGESTION ---
            // Only suggest if driver has a known depot
            if (driverPos?.depotLat && driverPos?.depotLng) {
                // Find the order closest to depot near the middle of the route
                const midStart = Math.floor(sortedDriverOrders.length * 0.3)
                const midEnd = Math.floor(sortedDriverOrders.length * 0.7)

                let bestSplitIndex = -1
                let minDepotDist = Infinity

                for (let i = midStart; i < midEnd; i++) {
                    const o = sortedDriverOrders[i]
                    if (o.latitude && o.longitude) {
                        const distToDepot = getDistance(o.latitude, o.longitude, driverPos.depotLat, driverPos.depotLng)
                        if (distToDepot < minDepotDist) {
                            minDepotDist = distToDepot
                            bestSplitIndex = i
                        }
                    }
                }

                if (bestSplitIndex >= 0) {
                    warnings.depotReloadSuggestions.push({
                        driverName: driver.name,
                        splitAfterOrderNumber: sortedDriverOrders[bestSplitIndex].order_number || `Stop #${bestSplitIndex + 1}`,
                        ordersBefore: bestSplitIndex + 1,
                        ordersAfter: sortedDriverOrders.length - bestSplitIndex - 1
                    })
                }
            }
        }

        finalOrders.push(...sortedDriverOrders)
    }

    const unassigned = updatedOrders.filter(o => !o.driver_id)
    finalOrders.push(...unassigned)

    return {
        orders: finalOrders,
        summary: {
            totalDistance: Math.round(grandTotalDistance * 10) / 10,
            unassignedCount: unassigned.length
        },
        driverStats,
        warnings,
        debug: {
            drivers: driverPositions.map(d => ({ name: d.name, valid: d.valid, lat: d.lat, lng: d.lng, address: d.address, source: d.source })),
        }
    }
}

/**
 * Check if a route would violate any time windows
 */
function wouldViolateTimeWindows(
    route: Order[],
    startLat: number,
    startLng: number,
    routeStartMin: number
): boolean {
    let currentTime = routeStartMin
    let prevLat = startLat
    let prevLng = startLng

    for (const order of route) {
        if (order.latitude && order.longitude) {
            const dist = getDistance(prevLat, prevLng, order.latitude, order.longitude)
            currentTime += estimateTravelTimeMin(dist)

            // Wait for window to open
            if (order.time_window_start) {
                const windowStart = timeToMinutes(order.time_window_start)
                if (currentTime < windowStart) currentTime = windowStart
            }

            // Check violation
            if (order.time_window_end) {
                const windowEnd = timeToMinutes(order.time_window_end)
                if (currentTime > windowEnd) return true
            }

            currentTime += AVERAGE_SERVICE_TIME_MIN
            prevLat = order.latitude
            prevLng = order.longitude
        }
    }

    return false
}
