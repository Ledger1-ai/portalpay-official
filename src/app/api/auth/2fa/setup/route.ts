import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt';
import { setup2FA } from '@/lib/auth/2fa';

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
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return { authenticated: false, error: 'User not found or inactive' };
    }
    
    return { authenticated: true, user };
  } catch (error) {
    return { authenticated: false, error: 'Invalid token' };
  }
}

// POST /api/auth/2fa/setup - Generate 2FA secret and QR code for setup
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

    // Check if 2FA is already enabled
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA is already enabled for this account' },
        { status: 400 }
      );
    }

    // Generate 2FA setup data
    const setupData = await setup2FA(user.email);

    // Store temporary secret (not yet activated)
    await User.findByIdAndUpdate(user._id, {
      twoFactorSecret: setupData.encryptedSecret,
      twoFactorEnabled: false, // Not enabled until verified
      twoFactorVerified: false
    });

    // Return setup data (excluding encrypted versions)
    return NextResponse.json({
      success: true,
      data: {
        secret: setupData.secret,
        qrCodeDataURL: setupData.qrCodeDataURL,
        backupCodes: setupData.backupCodes,
        message: 'Scan the QR code with your authenticator app and enter a verification code to complete setup.'
      }
    });

  } catch (error) {
    console.error('2FA setup error:', error);
    return NextResponse.json(
      { error: 'Failed to setup 2FA' },
      { status: 500 }
    );
  }
} 