/**
 * Maps raw technical/database error messages to user-friendly messages.
 * Prevents exposing Postgres internals, constraint names, and SQL details.
 */

const ERROR_PATTERNS: [RegExp, string][] = [
    // Duplicate / unique constraint violations
    [/duplicate key.*users_email_key/i, 'A user with this email already exists.'],
    [/duplicate key.*email/i, 'This email address is already in use.'],
    [/duplicate key.*phone/i, 'This phone number is already in use.'],
    [/duplicate key/i, 'This record already exists. Please check for duplicates.'],
    [/unique constraint/i, 'This record already exists. Please check for duplicates.'],
    [/already exists/i, 'This record already exists.'],

    // Foreign key violations
    [/foreign key.*company/i, 'The selected company could not be found.'],
    [/foreign key.*driver/i, 'The selected driver could not be found.'],
    [/foreign key.*order/i, 'The selected order could not be found.'],
    [/foreign key/i, 'A referenced record could not be found. Please refresh and try again.'],
    [/violates foreign key/i, 'A referenced record could not be found. Please refresh and try again.'],

    // Not null violations
    [/null value.*column.*email/i, 'Email is required.'],
    [/null value.*column.*name/i, 'Name is required.'],
    [/null value.*column.*password/i, 'Password is required.'],
    [/not-null constraint/i, 'A required field is missing. Please fill in all required fields.'],

    // Auth errors
    [/invalid login credentials/i, 'Invalid email or password. Please try again.'],
    [/email not confirmed/i, 'Please verify your email before logging in.'],
    [/user not found/i, 'No account found with this email.'],
    [/sub claim.*does not exist/i, 'This setup link is no longer valid. Please request a new one.'],
    [/invalid.*token/i, 'Your session has expired. Please log in again.'],
    [/jwt expired/i, 'Your session has expired. Please log in again.'],
    [/refresh_token.*not found/i, 'Your session has expired. Please log in again.'],
    [/password.*too short/i, 'Password must be at least 8 characters.'],
    [/password.*too weak/i, 'Please choose a stronger password.'],
    [/rate limit/i, 'Too many attempts. Please wait a moment and try again.'],
    [/over_email_send_rate_limit/i, 'Too many emails sent. Please wait a few minutes and try again.'],
    [/email_address_invalid/i, 'Please enter a valid email address.'],

    // Permission / RLS errors
    [/row-level security/i, 'You don\'t have permission to perform this action.'],
    [/permission denied/i, 'You don\'t have permission to perform this action.'],
    [/insufficient.*privilege/i, 'You don\'t have permission to perform this action.'],
    [/new row violates row-level security/i, 'You don\'t have permission to perform this action.'],
    [/policy/i, 'You don\'t have permission to perform this action.'],

    // Network / connection errors
    [/fetch.*failed/i, 'Connection error. Please check your internet and try again.'],
    [/network/i, 'Connection error. Please check your internet and try again.'],
    [/timeout/i, 'The request timed out. Please try again.'],
    [/ECONNREFUSED/i, 'Unable to connect to the server. Please try again later.'],
    [/503/i, 'Service temporarily unavailable. Please try again in a moment.'],
    [/500.*internal/i, 'Something went wrong on our end. Please try again.'],

    // Storage errors
    [/bucket.*not found/i, 'File storage is not configured properly.'],
    [/object.*not found/i, 'The file could not be found.'],
    [/payload too large/i, 'The file is too large. Please use a smaller file.'],

    // Driver limit
    [/driver limit/i, 'You\'ve reached your driver limit. Upgrade your plan to add more.'],
    [/order limit/i, 'You\'ve reached your order limit. Upgrade your plan to add more.'],

    // Geocoding
    [/geocod/i, 'Could not find coordinates for this address. Please check the address and try again.'],
]

/**
 * Convert a raw error message to a user-friendly one.
 * Falls back to a generic message if no pattern matches.
 */
export function friendlyError(error: unknown, fallback?: string): string {
    const message = extractMessage(error)

    // Check against known patterns
    for (const [pattern, friendly] of ERROR_PATTERNS) {
        if (pattern.test(message)) {
            return friendly
        }
    }

    // If the message is already short and doesn't look technical, pass it through
    if (message.length < 100 && !looksLikeTechnicalError(message)) {
        return message
    }

    return fallback || 'Something went wrong. Please try again.'
}

/**
 * Extract a string message from various error types
 */
function extractMessage(error: unknown): string {
    if (!error) return ''
    if (typeof error === 'string') return error
    if (error instanceof Error) return error.message
    if (typeof error === 'object') {
        const e = error as Record<string, any>
        return e.message || e.error || e.error_description || e.msg || JSON.stringify(error)
    }
    return String(error)
}

/**
 * Detect if a message looks like a raw technical/database error
 */
function looksLikeTechnicalError(msg: string): boolean {
    const technicalIndicators = [
        /violates/i,
        /constraint/i,
        /relation\s+"/i,
        /column\s+"/i,
        /pg_/i,
        /sql/i,
        /supabase/i,
        /postgres/i,
        /PGRST/i,
        /\boid\b/i,
        /schema/i,
        /function.*does not exist/i,
        /operator.*does not exist/i,
        /syntax error/i,
        /unexpected token/i,
        /cannot read properties/i,
        /undefined is not/i,
        /null is not/i,
        /type error/i,
    ]
    return technicalIndicators.some(p => p.test(msg))
}
