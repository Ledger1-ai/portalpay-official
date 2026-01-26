import { NextRequest, NextResponse } from 'next/server';
import { bearCloudGRPC } from '@/lib/services/bear-cloud-grpc';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 API Route: Exploring Bear Cloud gRPC service methods');
    const explorationResults = await bearCloudGRPC.exploreServiceMethods();
    
    return NextResponse.json({
      success: true,
      message: 'Service exploration completed',
      data: explorationResults
    });
  } catch (error) {
    console.error('❌ API Route error exploring service:', error);
    return NextResponse.json({
      success: false,
      error: 'Service exploration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}