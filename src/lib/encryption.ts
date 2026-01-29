import crypto from 'crypto';

// Use a consistent secret for the app. In production, this must be a random 32-byte string.
// Fallback to a dev secret if env var is missing (with a console warning in dev).
const SECRET_KEY = process.env.APP_SECRET || "dev-secret-key-32-bytes-long-need-change";
const ALGORITHM = 'aes-256-gcm';

// Ensure key is 32 bytes
const getKey = () => {
    return crypto.scryptSync(SECRET_KEY, 'salt', 32);
};

export function encrypt(text: string): string {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
    if (!text || !text.includes(':')) return text; // Return as-is if not encrypted format
    try {
        const [ivHex, authTagHex, encryptedHex] = text.split(':');
        if (!ivHex || !authTagHex || !encryptedHex) return text;

        const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error("Decryption failed:", e);
        return "***_DECRYPT_FAIL_***";
    }
}
