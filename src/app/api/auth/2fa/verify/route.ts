import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt';
import { validate2FASetup, encrypt, hashBackupCode } from '@/lib/auth/2fa';
import { z } from 'zod';

// Validation schema
const verifySchema = z.object({
  token: z.string().min(6, 'Token must be at least 6 characters').max(8, 'Token must be at most 8 characters'),
  backupCodes: z.array(z.string()).optional()
});

// Helper function to check authentication
async function checkAuth(request: NextRequest) {
  try {
    await connectDB();
    
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      return { authenticated: false, error: 'No token provided' };
    }
    
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId)
      .select('+twoFactorSecret +backupCodes'); // Include sensitive fields
    
    if (!user || !user.isActive) {
      return { authenticated: false, error: 'User not found or inactive' };
    }
    
    return { authenticated: true, user };
  } catch (error) {
    return { authenticated: false, error: 'Invalid token' };
  }
}

// POST /api/auth/2fa/verify - Verify 2FA setup and enable it
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
      );
    }

    const user = auth.user!;
    const body = await request.json();
    const validation = verifySchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.issues
        },
        { status: 400 }
      );
    }

    const { token, backupCodes } = validation.data;

    // Check if user has a secret to verify
    if (!user.twoFactorSecret) {
      return NextResponse.json(
        { error: 'No 2FA setup found. Please start setup first.' },
        { status: 400 }
      );
    }

    // Verify the token
    const isValid = validate2FASetup(user.twoFactorSecret, token);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid verification code. Please try again.' },
        { status: 400 }
      );
    }

    // Encrypt and store backup codes
    const encryptedBackupCodes = backupCodes ? 
      backupCodes.map(code => encrypt(hashBackupCode(code))) : [];

    // Enable 2FA
    await User.findByIdAndUpdate(user._id, {
      twoFactorEnabled: true,
      twoFactorVerified: true,
      backupCodes: encryptedBackupCodes
    });

    return NextResponse.json({
      success: true,
      data: {
        message: '2FA has been successfully enabled for your account.',
        backupCodesStored: encryptedBackupCodes.length
      }
    });

  } catch (error) {
    console.error('2FA verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify 2FA setup' },
      { status: 500 }
    );
  }
} 