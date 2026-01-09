try {
    const pkg = require('@farcaster/frame-sdk');
    console.log('Exports:', JSON.stringify(pkg, null, 2));
    console.log('Default:', pkg.default);
    console.log('sdk:', pkg.sdk);
} catch (e) {
    console.error(e);
}
