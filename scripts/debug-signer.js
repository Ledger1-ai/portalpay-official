const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function testSigner() {
    const toolsDir = path.join(__dirname, '../tools');
    const signerPath = path.join(toolsDir, 'uber-apk-signer.jar');
    const inputApk = path.join(__dirname, '../android/launcher/recovered/portalpay-unsigned.apk');
    const tempDir = path.join(__dirname, '../tmp/debug-sign');

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // Copy input to temp with specific name pattern to match production
    const testInput = path.join(tempDir, 'test-unsigned.apk');
    fs.copyFileSync(inputApk, testInput);

    console.log(`Input: ${testInput}`);

    const args = ["-jar", signerPath, "-a", testInput, "--allowResign"];
    console.log(`Running: java ${args.join(' ')}`);

    const logFile = fs.createWriteStream(path.join(tempDir, 'signer.log'));
    const child = spawn("java", args, { stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.pipe(logFile);
    child.stderr.pipe(logFile);

    child.on('close', (code) => {
        // give streams a moment to flush
        setTimeout(() => {
            logFile.end();
            console.log(`\nSigner exited with code ${code}`);
            console.log("Listing output directory:");
            const files = fs.readdirSync(tempDir);
            files.forEach(f => console.log(` - ${f}`));
        }, 500);
    });
}

testSigner();
