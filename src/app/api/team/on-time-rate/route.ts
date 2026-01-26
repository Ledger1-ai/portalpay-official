import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import SevenShiftsShift from '@/lib/models/SevenShiftsShift';
import ToastEmployee from '@/lib/models/ToastEmployee';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    await connectDB();
    const user = await User.findById(userId);
    if (!user || !user.toastGuid) {
      return NextResponse.json({ onTimeRate: null });
    }

    const toastEmployee = await ToastEmployee.findOne({ toastGuid: user.toastGuid });
    if (!toastEmployee || !toastEmployee.sevenShiftsId) {
      return NextResponse.json({ onTimeRate: null });
    }

    const shifts = await SevenShiftsShift.find({ userId: toastEmployee.sevenShiftsId });
    if (shifts.length === 0) {
      return NextResponse.json({ onTimeRate: null });
    }

    const onTimeShifts = shifts.filter(shift => (shift.lateMinutes || 0) <= 0);
    const onTimeRate = (onTimeShifts.length / shifts.length) * 100;

    return NextResponse.json({ onTimeRate: Math.round(onTimeRate) });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
