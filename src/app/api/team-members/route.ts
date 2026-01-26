import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { TeamMember } from '@/lib/models/TeamMember';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const teamMembers = await TeamMember.find({ status: 'active' }).sort({ name: 1 });

    return NextResponse.json({
      success: true,
      data: teamMembers
    });
  } catch (error) {
    console.error('Team members API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch team members'
    }, { status: 500 });
  }
}
