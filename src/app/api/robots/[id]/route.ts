import { NextRequest, NextResponse } from 'next/server';
import { createServerBearCloudAPI } from '@/lib/services/bear-cloud-server';

export async function GET(
  request: NextRequest,
  { params }: any
) {
  try {
    console.log(`📡 API Route: Getting robot ${params.id}`);
    
    const bearAPI = createServerBearCloudAPI();
    const robot = await bearAPI.getRobotById(params.id);
    
    if (!robot) {
      return NextResponse.json({
        success: false,
        error: 'Robot not found'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: robot
    });
  } catch (error) {
    console.error(`❌ API Route error getting robot ${params.id}:`, error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch robot',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}