#!/usr/bin/env node

/**
 * 🔍 Environment Variables Validator
 * Verifies all required environment variables for Appflow builds
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
};

// Required environment variables
const REQUIRED_VARS = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_XAI_API_KEY',
    'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
];

// Optional but recommended variables
const OPTIONAL_VARS = [
    'NEXT_PUBLIC_REVENUECAT_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
];

console.log(`\n${colors.blue}🔍 Verifying Environment Variables...${colors.reset}\n`);

// Check if .env.local exists
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
    console.log(`${colors.red}❌ Error: .env.local file not found!${colors.reset}`);
    console.log(`${colors.yellow}💡 Create .env.local in the project root directory${colors.reset}\n`);
    process.exit(1);
}

// Load .env.local
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};

envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join('=').trim();
        }
    }
});

let hasErrors = false;
let hasWarnings = false;

// Check required variables
console.log(`${colors.magenta}📋 Required Variables:${colors.reset}`);
REQUIRED_VARS.forEach(varName => {
    const value = envVars[varName];

    if (!value) {
        console.log(`  ${colors.red}❌ ${varName}: MISSING${colors.reset}`);
        hasErrors = true;
    } else if (value.length < 10) {
        console.log(`  ${colors.yellow}⚠️  ${varName}: TOO SHORT (might be invalid)${colors.reset}`);
        hasWarnings = true;
    } else if (value.includes('your-') || value.includes('YOUR-')) {
        console.log(`  ${colors.yellow}⚠️  ${varName}: Placeholder value detected${colors.reset}`);
        hasWarnings = true;
    } else if (value.startsWith('"') || value.startsWith("'")) {
        console.log(`  ${colors.yellow}⚠️  ${varName}: Remove quotes from value${colors.reset}`);
        hasWarnings = true;
    } else {
        const preview = value.length > 40 ? value.substring(0, 40) + '...' : value;
        console.log(`  ${colors.green}✅ ${varName}: ${preview}${colors.reset}`);
    }
});

// Check optional variables
console.log(`\n${colors.magenta}📋 Optional Variables:${colors.reset}`);
OPTIONAL_VARS.forEach(varName => {
    const value = envVars[varName];

    if (!value) {
        console.log(`  ${colors.blue}ℹ️  ${varName}: Not set (optional)${colors.reset}`);
    } else {
        const preview = value.length > 40 ? value.substring(0, 40) + '...' : value;
        console.log(`  ${colors.green}✅ ${varName}: ${preview}${colors.reset}`);
    }
});

// Security warnings
console.log(`\n${colors.magenta}🔐 Security Checks:${colors.reset}`);

// Check for service role key exposure
if (envVars['SUPABASE_SERVICE_ROLE_KEY']) {
    if (envVars['SUPABASE_SERVICE_ROLE_KEY'].startsWith('NEXT_PUBLIC_')) {
        console.log(`  ${colors.red}❌ CRITICAL: Service role key should NOT have NEXT_PUBLIC_ prefix!${colors.reset}`);
        hasErrors = true;
    } else {
        console.log(`  ${colors.green}✅ Service role key is private (not exposed to frontend)${colors.reset}`);
    }
}

// Check for trailing slashes in URL
if (envVars['NEXT_PUBLIC_SUPABASE_URL'] && envVars['NEXT_PUBLIC_SUPABASE_URL'].endsWith('/')) {
    console.log(`  ${colors.yellow}⚠️  Supabase URL has trailing slash (may cause issues)${colors.reset}`);
    hasWarnings = true;
} else if (envVars['NEXT_PUBLIC_SUPABASE_URL']) {
    console.log(`  ${colors.green}✅ Supabase URL format is correct${colors.reset}`);
}

// Check for whitespace
Object.keys(envVars).forEach(key => {
    const value = envVars[key];
    if (value !== value.trim()) {
        console.log(`  ${colors.yellow}⚠️  ${key} has leading/trailing whitespace${colors.reset}`);
        hasWarnings = true;
    }
});

// Final summary
console.log(`\n${colors.magenta}📊 Summary:${colors.reset}`);
console.log(`  Total variables in .env.local: ${Object.keys(envVars).length}`);
console.log(`  Required variables: ${REQUIRED_VARS.length}`);
console.log(`  Optional variables: ${OPTIONAL_VARS.length}`);

// Exit status
console.log('');
if (hasErrors) {
    console.log(`${colors.red}❌ Validation FAILED - Fix errors above before building${colors.reset}\n`);
    process.exit(1);
} else if (hasWarnings) {
    console.log(`${colors.yellow}⚠️  Validation PASSED with warnings - Review warnings above${colors.reset}\n`);
    process.exit(0);
} else {
    console.log(`${colors.green}✅ All checks PASSED - Ready for Appflow build!${colors.reset}\n`);

    // Print Appflow instructions
    console.log(`${colors.blue}📋 Next steps for Appflow:${colors.reset}`);
    console.log(`  1. Go to Appflow dashboard`);
    console.log(`  2. Add these ${REQUIRED_VARS.length} variables to Secrets/Environment`);
    console.log(`  3. Trigger new build\n`);

    process.exit(0);
}
