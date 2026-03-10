import Link from 'next/link'

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="max-w-md w-full text-center">
                <div className="text-8xl font-extrabold text-blue-600 dark:text-blue-400 mb-4">404</div>
                <h1 className="text-2xl font-bold text-foreground mb-2">Page not found</h1>
                <p className="text-muted-foreground mb-8">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11 px-6 transition-colors"
                    >
                        Go to Dashboard
                    </Link>
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center rounded-full border border-border hover:bg-accent font-semibold h-11 px-6 transition-colors"
                    >
                        Back to Home
                    </Link>
                </div>
            </div>
        </div>
    )
}
