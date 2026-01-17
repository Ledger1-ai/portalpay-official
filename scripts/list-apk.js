const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

async function listFiles() {
    // Check the signed output from the debug session
    const file = path.join(__dirname, '../tmp/debug-sign/test-aligned-debugSigned.apk');
    if (!fs.existsSync(file)) {
        console.log("File not found:", file);
        return;
    }
    console.log("Reading APK:", file);
    // Read as buffer
    const data = fs.readFileSync(file);
    const zip = await JSZip.loadAsync(data);

    console.log("Searching for libs...");
    const files = Object.keys(zip.files);

    // Look for libs
    const libs = files.filter(f => f.startsWith('lib/') || f.endsWith('.so'));
    console.log(`Found ${libs.length} lib files:`);
    libs.slice(0, 20).forEach(f => console.log(f)); // Show first 20

    // Look for assets/wrap.html
    if (files.includes('assets/wrap.html')) {
        console.log("\nFound assets/wrap.html");
    }
}

listFiles();
