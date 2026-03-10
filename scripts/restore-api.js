// scripts/restore-api.js
// Restores server routes and middleware from temp directory after mobile build
const fs = require('fs');
const path = require('path');
const os = require('os');

const tempDir = path.join(os.tmpdir(), 'raute-api-backup');
const routesToRestore = [
    { dest: path.join(process.cwd(), 'app', 'api'), name: 'api' },
    { dest: path.join(process.cwd(), 'app', 'auth'), name: 'auth' },
    { dest: path.join(process.cwd(), 'app', 'track'), name: 'track' },
    { dest: path.join(process.cwd(), 'middleware.ts'), name: 'middleware.ts' }
];

routesToRestore.forEach(({ dest, name }) => {
    const src = path.join(tempDir, name);

    if (fs.existsSync(src)) {
        // Remove current if exists
        if (fs.existsSync(dest)) {
            fs.rmSync(dest, { recursive: true });
        }

        // Copy back from temp (supports cross-drive)
        if (fs.statSync(src).isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
        } else {
            fs.copyFileSync(src, dest);
        }

        console.log(`✅ Restored ${name} from backup`);
    } else {
        console.log(`⚠️ Backup for ${name} not found, skipping`);
    }
});

// Clean up temp directory
if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
    console.log('✅ Cleaned up temp directory');
}
