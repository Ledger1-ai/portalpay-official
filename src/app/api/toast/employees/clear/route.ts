import { NextRequest, NextResponse } from 'next/server';
import ToastEmployee from '@/lib/models/ToastEmployee';
import { connectDB } from '@/lib/db/connection';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const restaurantGuid = searchParams.get('restaurantGuid');

    if (!restaurantGuid) {
      return NextResponse.json({
        error: 'restaurantGuid parameter is required',
      }, { status: 400 });
    }

    await connectDB();

    // Clear all employees for this restaurant to force fresh sync from Toast
    const result = await ToastEmployee.deleteMany({ restaurantGuid });

    return NextResponse.json({
      success: true,
      message: `Cleared ${result.deletedCount} employees for restaurant ${restaurantGuid}`,
      deletedCount: result.deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Clear employees error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear employees',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}