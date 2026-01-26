import { NextRequest, NextResponse } from 'next/server';
import { bearCloudGRPC } from '@/lib/services/bear-cloud-grpc';

export async function GET(request: NextRequest) {
  try {
    console.log('📡 API Route: Testing Bear Cloud gRPC authentication');
    
    const success = await bearCloudGRPC.testAuthentication();
    
    return NextResponse.json({
      success,
      message: success 
        ? 'Bear Cloud gRPC API authentication successful'
        : 'Bear Cloud gRPC API authentication failed - using mock data'
    });
  } catch (error) {
    console.error('❌ API Route error testing authentication:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Authentication test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}