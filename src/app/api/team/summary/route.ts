import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/connection'
import { User } from '@/lib/models/User'
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt'

async function checkPermissions(request: NextRequest) {
  try {
    await connectDB()

    const authHeader = request.headers.get('authorization')
    const token = extractTokenFromHeader(authHeader)

    if (!token) {
      return { authorized: false, error: 'No token provided' }
    }

    const decoded = verifyToken(token)
    const user = await User.findById(decoded.userId)

    if (!user || !user.isActive) {
      return { authorized: false, error: 'User not found or inactive' }
    }

    const permissions: string[] =
      typeof (user as any).getPermissions === 'function'
        ? (user as any).getPermissions()
        : ((user as any).permissions || [])

    if (!permissions.includes('team') && !permissions.includes('admin')) {
      return { authorized: false, error: 'Insufficient permissions' }
    }

    return { authorized: true, user, permissions }
  } catch (error) {
    return { authorized: false, error: 'Invalid token' }
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await checkPermissions(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
      )
    }

    // Aggregate counts by role and status
    const [byRole, byStatus] = await Promise.all([
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { $group: { _id: '$isActive', count: { $sum: 1 } } }
      ])
    ])

    const countsByRole: Record<string, number> = {}
    for (const entry of byRole) {
      countsByRole[entry._id] = entry.count
    }

    let totalActive = 0
    let totalInactive = 0
    for (const entry of byStatus) {
      if (entry._id === true) totalActive = entry.count
      else if (entry._id === false) totalInactive = entry.count
    }

    return NextResponse.json({
      success: true,
      data: {
        countsByRole,
        totalActive,
        totalInactive,
      }
    })
  } catch (error) {
    console.error('Team summary GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch team summary' },
      { status: 500 }
    )
  }
}


