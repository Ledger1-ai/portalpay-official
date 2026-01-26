import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt';
import { z } from 'zod';

// Validation schemas
const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  role: z.string().min(1, 'Role is required'),
  permissions: z
    .array(
      z.enum([
        'dashboard',
        'scheduling',
        'inventory',
        'invoicing',
        'inventory:financial',
        'team',
        'team:performance',
        'team:management',
        'analytics',
        'analytics:detailed',
        'settings',
        'settings:users',
        'settings:system',
        'roster',
        'menu',
        'robotic-fleets',
        'hostpro',
        'admin',
      ])
    )
    .optional(),
  isActive: z.boolean().optional().default(true),
  mustChangePassword: z.boolean().optional().default(true),
});

const updateUserSchema = createUserSchema.partial().extend({
  id: z.string().min(1, 'User ID is required')
});

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

// GET /api/team - List all team members
export async function GET(request: NextRequest) {
  try {
    const auth = await checkPermissions(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || '';
    const status = searchParams.get('status') || '';

    // Build query
    const query: any = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) {
      query.role = role;
    }
    
    if (status) {
      query.isActive = status === 'active';
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get users
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -twoFactorSecret -backupCodes')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email'),
      User.countDocuments(query)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Team GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    );
  }
}

// POST /api/team - Create new team member
export async function POST(request: NextRequest) {
  try {
    const auth = await checkPermissions(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = createUserSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.issues
        },
        { status: 400 }
      );
    }

    const { name, email, role, permissions, isActive, mustChangePassword } = validation.data;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';

    // Create new user
    const newUser = new User({
      name,
      email,
      role,
      password: tempPassword,
      permissions: permissions || [],
      isActive: isActive ?? true,
      isFirstLogin: true,
      mustChangePassword: mustChangePassword ?? true,
      createdBy: auth.user!._id
    });

    await newUser.save();

    // Return user without sensitive data
    const userResponse = await User.findById(newUser._id)
      .select('-password -twoFactorSecret -backupCodes')
      .populate('createdBy', 'name email');

    return NextResponse.json({
      success: true,
      data: {
        user: userResponse,
        temporaryPassword: tempPassword,
        message: 'User created successfully. Please share the temporary password securely.'
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Team POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create team member' },
      { status: 500 }
    );
  }
}

// PUT /api/team - Update team member
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkPermissions(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = updateUserSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validation.error.issues
        },
        { status: 400 }
      );
    }

    const { id, ...updateData } = validation.data;

    // Check if user exists
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent self-deactivation for Super Admins
    if (existingUser._id.toString() === auth.user!._id.toString() && 
        updateData.isActive === false) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      );
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        ...updateData,
        updatedBy: auth.user!._id
      },
      { new: true, runValidators: true }
    ).select('-password -twoFactorSecret -backupCodes')
     .populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');

    return NextResponse.json({
      success: true,
      data: { user: updatedUser }
    });

  } catch (error) {
    console.error('Team PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update team member' },
      { status: 500 }
    );
  }
}

// DELETE /api/team - Delete team member (actually deactivate)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkPermissions(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent self-deletion
    if (existingUser._id.toString() === auth.user!._id.toString()) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Soft delete by deactivating
    await User.findByIdAndUpdate(userId, {
      isActive: false,
      updatedBy: auth.user!._id
    });

    return NextResponse.json({
      success: true,
      message: 'Team member deactivated successfully'
    });

  } catch (error) {
    console.error('Team DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete team member' },
      { status: 500 }
    );
  }
} 