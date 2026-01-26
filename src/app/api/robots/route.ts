import { NextRequest, NextResponse } from 'next/server';
import { bearCloudGRPC } from '@/lib/services/bear-cloud-grpc';
import { isDemoMode } from '@/lib/config/demo';

export async function GET(request: NextRequest) {
  try {
    console.log('📡 API Route: Getting all robots via gRPC');
    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        data: [
          { id: 'RB-001', name: 'Atlas', status: 'idle', battery: 86, uptime: '2h 45m', location: 'Dining Room' },
          { id: 'RB-002', name: 'Mira', status: 'charging', battery: 34, uptime: '0h 55m', location: 'Dock' },
        ],
        count: 2,
        authenticated: true
      });
    }
    
    // Test if gRPC client can initialize
    const testResult = await bearCloudGRPC.testAuthentication();
    console.log('🔐 gRPC authentication test result:', testResult);
    
    const robots = await bearCloudGRPC.getAllRobots();
    console.log('🤖 Retrieved robots:', robots.length);
    
    return NextResponse.json({
      success: true,
      data: robots,
      count: robots.length,
      authenticated: testResult
    });
  } catch (error) {
    console.error('❌ API Route error getting robots:', error);
    console.error('❌ Full error details:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch robots',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}