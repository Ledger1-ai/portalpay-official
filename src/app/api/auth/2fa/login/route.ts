import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import { generateTokens } from '@/lib/auth/jwt';
import { verify2FA } from '@/lib/auth/2fa';
import { z } from 'zod';

// Rate limiting storage (in production, use Redis)
const rateLimitMap = new Map<string, { attempts: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Validation schema
const verify2FASchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  twoFactorToken: z.string().min(6, 'Token must be at least 6 characters').max(8, 'Token must be at most 8 characters'),
});

function getRateLimitKey(ip: string, email: string): string {
  return `2fa:${ip}:${email}`;
}

function checkRateLimit(key: string): { isBlocked: boolean; remainingAttempts: number } {
  const record = rateLimitMap.get(key);
  const now = Date.now();

  if (!record) {
    return { isBlocked: false, remainingAttempts: MAX_ATTEMPTS };
  }

  // Reset if lockout period has passed
  if (now - record.lastAttempt > LOCKOUT_DURATION) {
    rateLimitMap.delete(key);
    return { isBlocked: false, remainingAttempts: MAX_ATTEMPTS };
  }

  const isBlocked = record.attempts >= MAX_ATTEMPTS;
  const remainingAttempts = Math.max(0, MAX_ATTEMPTS - record.attempts);

  return { isBlocked, remainingAttempts };
}

function recordFailedAttempt(key: string): void {
  const record = rateLimitMap.get(key) || { attempts: 0, lastAttempt: 0 };
  record.attempts += 1;
  record.lastAttempt = Date.now();
  rateLimitMap.set(key, record);
}

function clearFailedAttempts(key: string): void {
  rateLimitMap.delete(key);
}

// POST /api/auth/2fa/login - Complete login with 2FA verification
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Get client IP (for rate limiting)
    const ip = request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const body = await request.json();
    const validation = verify2FASchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.issues
        },
        { status: 400 }
      );
    }

    const { email, password, twoFactorToken } = validation.data;
    const rateLimitKey = getRateLimitKey(ip, email);

    // Check rate limiting
    const { isBlocked, remainingAttempts } = checkRateLimit(rateLimitKey);
    if (isBlocked) {
      return NextResponse.json(
        {
          success: false,
          message: 'Too many failed 2FA attempts. Please try again later.',
          retryAfter: Math.ceil(LOCKOUT_DURATION / 1000),
        },
        { status: 429 }
      );
    }

    // Find user with sensitive fields
    const user = await User.findOne({
      email: email.toLowerCase(),
      isActive: true
    }).select('+password +twoFactorSecret +backupCodes');

    if (!user) {
      recordFailedAttempt(rateLimitKey);
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid credentials',
          remainingAttempts: remainingAttempts - 1,
        },
        { status: 401 }
      );
    }

    // Verify password first
    const isPasswordValid = await (user as any).comparePassword(password);
    if (!isPasswordValid) {
      recordFailedAttempt(rateLimitKey);
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid credentials',
          remainingAttempts: remainingAttempts - 1,
        },
        { status: 401 }
      );
    }

    // Check if 2FA is enabled
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json(
        {
          success: false,
          message: '2FA is not enabled for this account',
        },
        { status: 400 }
      );
    }

    // Check if user needs password change (should have been handled in regular login)
    const needsPasswordChange = (user as any).needsPasswordChange();
    if (needsPasswordChange) {
      return NextResponse.json(
        {
          success: false,
          message: 'Password change required. Please use the regular login endpoint.',
        },
        { status: 400 }
      );
    }

    // Verify 2FA token
    const verification = verify2FA(
      twoFactorToken,
      user.twoFactorSecret,
      user.backupCodes || []
    );

    if (!verification.success) {
      recordFailedAttempt(rateLimitKey);
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid 2FA code',
          remainingAttempts: remainingAttempts - 1,
        },
        { status: 401 }
      );
    }

    // If backup code was used, remove it
    if (verification.isBackupCode && verification.usedBackupCode) {
      (user as any).useBackupCode(verification.usedBackupCode);
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(rateLimitKey);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const tokens = await generateTokens(user._id.toString());

    // Set secure httpOnly cookie for refresh token
    const response = NextResponse.json(
      {
        success: true,
        message: 'Login successful',
        user: tokens.user,
        accessToken: tokens.accessToken,
        usedBackupCode: verification.isBackupCode
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
    console.error('2FA login error:', error);
    return NextResponse.json(
      { error: 'Failed to verify 2FA login' },
      { status: 500 }
    );
  }
} 