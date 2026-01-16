const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const JRE_URL = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_x64_linux_hotspot_17.0.9_9.tar.gz";
const TARGET_DIR = path.join(__dirname, 'tools', 'jre-linux');
const TAR_FILE = path.join(__dirname, 'tools', 'jre-linux.tar.gz');

if (!fs.existsSync(TARGET_DIR)) {
    console.log("Portable JRE not found. Downloading...");
    fs.mkdirSync(TARGET_DIR, { recursive: true });

    const file = fs.createWriteStream(TAR_FILE);
    https.get(JRE_URL, function (response) {
        response.pipe(file);
        file.on('finish', function () {
            file.close(() => {
                console.log("Download complete. Extracting...");
                try {
                    execSync(`tar -xzf ${TAR_FILE} -C ${TARGET_DIR} --strip-components=1`);
                    console.log("Extraction complete.");
                    fs.chmodSync(path.join(TARGET_DIR, 'bin', 'java'), '755');
                    fs.unlinkSync(TAR_FILE);
                } catch (e) {
                    console.error("Failed to extract JRE:", e);
                }
            });
        });
    });
} else {
    console.log("Portable JRE already exists.");
}
