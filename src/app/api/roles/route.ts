import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/connection'
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt'
import { Role, allowedPermissions } from '@/lib/models/Role'
import { z } from 'zod'

async function checkAdmin(request: NextRequest) {
  await connectDB()
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromHeader(authHeader)
  if (!token) return { authorized: false }
  try {
    const decoded = verifyToken(token)
    return { authorized: !!decoded, userId: decoded.userId }
  } catch {
    return { authorized: false }
  }
}

const roleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional().default(''),
  permissions: z.array(z.enum([...allowedPermissions] as [string, ...string[]])).default([]),
  color: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await checkAdmin(request)
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const roles = await Role.find().sort({ isSystem: -1, name: 1 })
  return NextResponse.json({ success: true, data: { roles } })
}

export async function POST(request: NextRequest) {
  const auth = await checkAdmin(request)
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const parsed = roleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })

  const existing = await Role.findOne({ name: parsed.data.name })
  if (existing) return NextResponse.json({ error: 'Role already exists' }, { status: 409 })

  // auto-assign color if none
  const palette = ['bg-red-500','bg-blue-500','bg-green-500','bg-yellow-500','bg-purple-500','bg-pink-500','bg-orange-500','bg-teal-500']
  let color = parsed.data.color || palette[Math.floor(Math.random() * palette.length)]

  const role = await Role.create({ ...parsed.data, color, isSystem: false })
  return NextResponse.json({ success: true, data: { role } }, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const auth = await checkAdmin(request)
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'Role ID is required' }, { status: 400 })
  const parsed = roleSchema.partial().safeParse(rest)
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
  const found = await Role.findById(id)
  if (!found) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  if (found.isSystem && found.name === 'Super Admin') {
    return NextResponse.json({ error: 'Super Admin is not editable' }, { status: 400 })
  }
  const updated = await Role.findByIdAndUpdate(id, parsed.data, { new: true })
  return NextResponse.json({ success: true, data: { role: updated } })
}

export async function DELETE(request: NextRequest) {
  const auth = await checkAdmin(request)
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Role ID is required' }, { status: 400 })
  const found = await Role.findById(id)
  if (!found) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  if (found.isSystem) return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 400 })
  await Role.findByIdAndDelete(id)
  return NextResponse.json({ success: true })
}


