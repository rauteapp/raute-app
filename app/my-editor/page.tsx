import { Suspense } from "react"
import ClientOrderDetails from "./client-page"

export default function OrderDetailsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center safe-area-p">Loading...</div>}>
            <ClientOrderDetails />
        </Suspense>
    )
}
