import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import CryptoJS from 'crypto-js';

// Environment variables for encryption
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'varuni-2fa-secret-key-change-in-production';
const APP_NAME = 'Ledger1';

/**
 * Generate a new TOTP secret for a user
 */
export function generateTOTPSecret(userEmail: string) {
  const secret = speakeasy.generateSecret({
    name: `${APP_NAME} (${userEmail})`,
    issuer: APP_NAME,
    length: 32
  });

  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url,
    qrCodeUrl: secret.otpauth_url
  };
}

/**
 * Generate QR code data URL for TOTP setup
 */
export async function generateQRCode(otpauthUrl: string): Promise<string> {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCodeDataURL;
  } catch {
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Verify a TOTP token
 */
export function verifyTOTP(token: string, secret: string, window: number = 1): boolean {
  try {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: window, // Allow for slight time drift
      step: 30 // 30-second time step
    });
  } catch {
    return false;
  }
}

/**
 * Generate backup codes for 2FA recovery
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    // Format as XXXX-XXXX for readability
    const formattedCode = `${code.slice(0, 4)}-${code.slice(4)}`;
    codes.push(formattedCode);
  }
  
  return codes;
}

/**
 * Encrypt sensitive data (secrets, backup codes)
 */
export function encrypt(text: string): string {
  try {
    const encrypted = CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
    return encrypted;
  } catch {
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedText: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!decrypted) {
      throw new Error('Decryption failed - invalid data');
    }
    
    return decrypted;
  } catch {
    throw new Error('Decryption failed');
  }
}

/**
 * Hash backup codes for secure storage comparison
 */
export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Verify a backup code against stored hash
 */
export function verifyBackupCode(code: string, hashedCode: string): boolean {
  const inputHash = hashBackupCode(code);
  return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(hashedCode));
}

/**
 * Setup 2FA for a user - returns secret and QR code
 */
export async function setup2FA(userEmail: string) {
  const { secret, otpauthUrl } = generateTOTPSecret(userEmail);
  const qrCodeDataURL = await generateQRCode(otpauthUrl!) as string;
  const backupCodes = generateBackupCodes();
  
  return {
    secret,
    qrCodeDataURL,
    backupCodes,
    encryptedSecret: encrypt(secret),
    encryptedBackupCodes: backupCodes.map(code => encrypt(hashBackupCode(code)))
  };
}

/**
 * Verify 2FA token (TOTP or backup code)
 */
export function verify2FA(
  token: string, 
  encryptedSecret: string, 
  encryptedBackupCodes: string[]
): { success: boolean; isBackupCode: boolean; usedBackupCode?: string } {
  // First try TOTP verification
  try {
    const secret = decrypt(encryptedSecret);
    if (verifyTOTP(token, secret)) {
      return { success: true, isBackupCode: false };
    }
  } catch {
    // If TOTP fails, try backup codes
  }
  
  // Try backup codes
  for (const encryptedCode of encryptedBackupCodes) {
    try {
      const hashedCode = decrypt(encryptedCode);
      if (verifyBackupCode(token, hashedCode)) {
        return { 
          success: true, 
          isBackupCode: true, 
          usedBackupCode: encryptedCode 
        };
      }
    } catch {
      continue;
    }
  }
  
  return { success: false, isBackupCode: false };
}

/**
 * Generate new backup codes (for when user runs out)
 */
export function regenerateBackupCodes() {
  const backupCodes = generateBackupCodes();
  return {
    backupCodes,
    encryptedBackupCodes: backupCodes.map(code => encrypt(hashBackupCode(code)))
  };
}

/**
 * Check if 2FA setup is complete and valid
 */
export function validate2FASetup(encryptedSecret: string, testToken: string): boolean {
  try {
    const secret = decrypt(encryptedSecret);
    return verifyTOTP(testToken, secret);
  } catch {
    return false;
  }
}

// Export types for TypeScript
export interface TwoFactorSetup {
  secret: string;
  qrCodeDataURL: string;
  backupCodes: string[];
  encryptedSecret: string;
  encryptedBackupCodes: string[];
}

export interface TwoFactorVerification {
  success: boolean;
  isBackupCode: boolean;
  usedBackupCode?: string;
}

export interface BackupCodeRegeneration {
  backupCodes: string[];
  encryptedBackupCodes: string[];
} 