import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt';

// Helper function to check permissions
async function checkPermissions(request: NextRequest) {
  try {
    await connectDB();
    
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      return { authorized: false, error: 'No token provided' };
    }
    
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return { authorized: false, error: 'User not found or inactive' };
    }
    
    const permissions: string[] =
      typeof (user as any).getPermissions === 'function'
        ? (user as any).getPermissions()
        : ((user as any).permissions || []);
    if (!permissions.includes('team') && !permissions.includes('admin')) {
      return { authorized: false, error: 'Insufficient permissions' };
    }
    
    return { authorized: true, user, permissions };
  } catch (error) {
    return { authorized: false, error: 'Invalid token' };
  }
}

// POST /api/team/[id]/reset-password - Force password reset
export async function POST(
  request: NextRequest,
  { params }: any
) {
  try {
    const auth = await checkPermissions(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
      );
    }

    const { id } = params;

    // Check if user exists
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent self-reset unless Super Admin
    if (targetUser._id.toString() === auth.user!._id.toString() && 
        auth.user!.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Cannot reset your own password' },
        { status: 400 }
      );
    }

    // Generate new temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';

    // Update user to force password change
    await User.findByIdAndUpdate(id, {
      password: tempPassword,
      mustChangePassword: true,
      isFirstLogin: false, // Not first login but must change
      updatedBy: auth.user!._id
    });

    return NextResponse.json({
      success: true,
      data: {
        temporaryPassword: tempPassword,
        message: 'Password reset successfully. Please share the temporary password securely with the user.'
      }
    });

  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
} 