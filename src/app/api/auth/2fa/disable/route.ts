import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt';
import { z } from 'zod';

// Validation schema
const disableSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  confirmDisable: z.boolean().refine(val => val === true, 'You must confirm disabling 2FA')
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
      .select('+password +twoFactorSecret +backupCodes'); // Include sensitive fields
    
    if (!user || !user.isActive) {
      return { authenticated: false, error: 'User not found or inactive' };
    }
    
    return { authenticated: true, user };
  } catch (error) {
    return { authenticated: false, error: 'Invalid token' };
  }
}

// POST /api/auth/2fa/disable - Disable 2FA with password confirmation
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
    const validation = disableSchema.safeParse(body);
    
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

    // Disable 2FA
    await User.findByIdAndUpdate(user._id, {
      $unset: {
        twoFactorSecret: 1,
        backupCodes: 1
      },
      $set: {
        twoFactorEnabled: false,
        twoFactorVerified: false
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        message: '2FA has been successfully disabled for your account.'
      }
    });

  } catch (error) {
    console.error('2FA disable error:', error);
    return NextResponse.json(
      { error: 'Failed to disable 2FA' },
      { status: 500 }
    );
  }
} 