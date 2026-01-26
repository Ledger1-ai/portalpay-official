import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import { verifyRefreshToken, generateTokens } from '@/lib/auth/jwt';

export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get refresh token from httpOnly cookie
    const refreshToken = request.cookies.get('refreshToken')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        {
          success: false,
          message: 'No refresh token provided',
        },
        { status: 401 }
      );
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      // Clear invalid refresh token
      const response = NextResponse.json(
        {
          success: false,
          message: 'Invalid or expired refresh token',
        },
        { status: 401 }
      );

      response.cookies.set('refreshToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });

      return response;
    }

    // Check if user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      // Clear refresh token
      const response = NextResponse.json(
        {
          success: false,
          message: 'User not found or inactive',
        },
        { status: 401 }
      );

      response.cookies.set('refreshToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });

      return response;
    }

    // Generate new tokens
    const tokens = await generateTokens(user._id.toString());

    // Create response with new access token
    const response = NextResponse.json(
      {
        success: true,
        message: 'Token refreshed successfully',
        user: tokens.user,
        accessToken: tokens.accessToken,
      },
      { status: 200 }
    );

    // Set new refresh token as httpOnly cookie
    response.cookies.set('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;

  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred during token refresh',
      },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 