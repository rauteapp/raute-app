// scripts/prepare-mobile-build.js
// Temporarily moves server routes and middleware to temp directory before mobile build
const fs = require('fs');
const path = require('path');
const os = require('os');

const tempDir = path.join(os.tmpdir(), 'raute-api-backup');
const routesToBackup = [
    { src: path.join(process.cwd(), 'app', 'api'), name: 'api' },
    { src: path.join(process.cwd(), 'app', 'auth'), name: 'auth' },
    { src: path.join(process.cwd(), 'app', 'track'), name: 'track' },  // Dynamic route — web-only (customer tracking)
    { src: path.join(process.cwd(), 'middleware.ts'), name: 'middleware.ts' }
];

// Create temp directory
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

routesToBackup.forEach(({ src, name }) => {
    const dest = path.join(tempDir, name);

    if (fs.existsSync(src)) {
        // Remove old backup if exists
        if (fs.existsSync(dest)) {
            fs.rmSync(dest, { recursive: true });
        }

        // Copy to temp directory (supports cross-drive)
        if (fs.statSync(src).isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
        } else {
            fs.copyFileSync(src, dest);
        }

        // Remove original
        fs.rmSync(src, { recursive: true });
        console.log(`✅ Backed up ${name} to temp directory`);
    } else {
        console.log(`⚠️ ${src} not found, skipping`);
    }
});

// Clean .next directory to prevent stale build artifacts and type references
const nextDir = path.join(process.cwd(), '.next');
if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true });
    console.log('✅ Cleaned .next directory (fresh build)');
}
