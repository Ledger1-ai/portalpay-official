import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt';
import { regenerateBackupCodes } from '@/lib/auth/2fa';
import { z } from 'zod';

// Validation schema
const regenerateSchema = z.object({
  password: z.string().min(1, 'Password is required')
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
      .select('+password +backupCodes'); // Include sensitive fields
    
    if (!user || !user.isActive) {
      return { authenticated: false, error: 'User not found or inactive' };
    }
    
    return { authenticated: true, user };
  } catch (error) {
    return { authenticated: false, error: 'Invalid token' };
  }
}

// POST /api/auth/2fa/backup-codes - Regenerate backup codes
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
    const validation = regenerateSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.issues
        },
        { status: 400 }
      );
    }

    const { password } = validation.data;

    // Check if 2FA is enabled
    if (!user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA is not enabled for this account' },
        { status: 400 }
      );
    }

    // Verify password
    const isPasswordValid = await (user as any).comparePassword(password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 400 }
      );
    }

    // Generate new backup codes
    const { backupCodes, encryptedBackupCodes } = regenerateBackupCodes();

    // Update user with new backup codes
    await User.findByIdAndUpdate(user._id, {
      backupCodes: encryptedBackupCodes
    });

    return NextResponse.json({
      success: true,
      data: {
        backupCodes,
        message: 'New backup codes have been generated. Please store them securely. Your old backup codes are no longer valid.'
      }
    });

  } catch (error) {
    console.error('Backup codes regeneration error:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate backup codes' },
      { status: 500 }
    );
  }
}

// GET /api/auth/2fa/backup-codes - Get backup codes count (not the codes themselves)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
      );
    }

    const user = auth.user!;

    // Check if 2FA is enabled
    if (!user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA is not enabled for this account' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        backupCodesCount: user.backupCodes?.length || 0,
        message: 'Backup codes information retrieved successfully.'
      }
    });

  } catch (error) {
    console.error('Backup codes info error:', error);
    return NextResponse.json(
      { error: 'Failed to get backup codes information' },
      { status: 500 }
    );
  }
} 