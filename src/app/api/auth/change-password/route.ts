import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import { verifyToken, extractTokenFromHeader, generateTokens } from '@/lib/auth/jwt';
import { z } from 'zod';

// Validation schema
const changePasswordSchema = z.object({
  currentPassword: z.string().optional(), // Optional for first login
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
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
      .select('+password');
    
    if (!user || !user.isActive) {
      return { authenticated: false, error: 'User not found or inactive' };
    }
    
    return { authenticated: true, user, decoded };
  } catch (error) {
    return { authenticated: false, error: 'Invalid token' };
  }
}

// POST /api/auth/change-password - Change password for first login or forced change
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
    const decoded = auth.decoded!;
    const body = await request.json();
    
    const validation = changePasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.issues
        },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = validation.data;

    // Check if this is a password change operation (user has limited permissions)
    const isPasswordChangeToken = decoded.permissions.includes('password-change') && 
                                  decoded.permissions.length === 1;

    // Determine if this is a first login or forced password change scenario
    const isFirstLoginOrForced = user.isFirstLogin || user.mustChangePassword;

    if (isFirstLoginOrForced) {
      // For first-login or forced password change, only allow if they have the special token
      if (!isPasswordChangeToken) {
        return NextResponse.json(
          { error: 'Invalid token for password change' },
          { status: 403 }
        );
      }
      // For first login or forced change, we don't verify current password
    } else {
      // For regular password changes, verify current password
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required' },
          { status: 400 }
        );
      }

      const isCurrentPasswordValid = await (user as any).comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        );
      }
    }

    // Update password and clear flags (avoid calling model method for TS compatibility)
    user.password = newPassword;
    user.isFirstLogin = false;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    // Generate new full tokens for the user
    const tokens = await generateTokens(user._id.toString());

    // Set secure httpOnly cookie for refresh token
    const response = NextResponse.json(
      {
        success: true,
        message: 'Password changed successfully',
        user: tokens.user,
        accessToken: tokens.accessToken,
        isFirstLogin: false // Always false after password change
      },
      { status: 200 }
    );

    // Set refresh token as httpOnly cookie
    response.cookies.set('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;

  } catch (error) {
    console.error('Password change error:', error);
    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
} 