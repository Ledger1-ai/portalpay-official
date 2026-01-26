import jwt, { type SignOptions, type Secret } from 'jsonwebtoken';
import { User } from '../models/User';

const JWT_SECRET: Secret = (process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production') as Secret;
const JWT_EXPIRES_IN: SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN || '7d') as any;
const JWT_REFRESH_EXPIRES_IN: SignOptions['expiresIn'] = (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any;

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    permissions: string[];
  };
}

/**
 * Generate JWT access token
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'varuni-backoffice',
    audience: 'varuni-users',
  });
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { userId, type: 'refresh' },
    JWT_SECRET,
    {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'varuni-backoffice',
      audience: 'varuni-users',
    }
  );
}

/**
 * Generate both access and refresh tokens
 */
export async function generateTokens(userId: string): Promise<AuthTokens> {
  try {
    const user = await User.findById(userId).lean();
    if (!user) {
      throw new Error('User not found');
    }

    // Merge explicit permissions with role-derived defaults using the model's helper if available
    let effectivePermissions: string[] = [];
    try {
      // If we fetched via .lean(), methods are not present; refetch doc to access getPermissions
      const doc = await User.findById(userId);
      if (doc && typeof (doc as any).getPermissions === 'function') {
        effectivePermissions = (doc as any).getPermissions();
      } else {
        effectivePermissions = user.permissions || [];
      }
    } catch {
      effectivePermissions = user.permissions || [];
    }

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      permissions: effectivePermissions,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(userId);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: effectivePermissions,
      },
    };
  } catch (error) {
    console.error('Error generating tokens:', error);
    throw new Error('Failed to generate authentication tokens');
  }
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'varuni-backoffice',
      audience: 'varuni-users',
    }) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token verification failed');
    }
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): { userId: string; type: string } {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'varuni-backoffice',
      audience: 'varuni-users',
    }) as { userId: string; type: string };

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Refresh token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid refresh token');
    } else {
      throw new Error('Refresh token verification failed');
    }
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Check if user has required permission
 */
export function hasPermission(userPermissions: string[], requiredPermission: string): boolean {
  return userPermissions.includes(requiredPermission) || userPermissions.includes('admin');
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: string, requiredRoles: string[]): boolean {
  return requiredRoles.includes(userRole) || userRole === 'Super Admin';
} 