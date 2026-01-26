import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing gRPC client initialization...');
    
    // Try to import the gRPC service
    let bearCloudGRPC;
    try {
      const grpcModule = await import('@/lib/services/bear-cloud-grpc');
      bearCloudGRPC = grpcModule.bearCloudGRPC;
      console.log('✅ Successfully imported bear-cloud-grpc module');
    } catch (importError) {
      console.error('❌ Failed to import bear-cloud-grpc:', importError);
      return NextResponse.json({
        success: false,
        error: 'Import failed',
        message: importError instanceof Error ? importError.message : 'Unknown import error',
        stack: importError instanceof Error ? importError.stack : undefined
      }, { status: 500 });
    }

    // Try to call testAuthentication to trigger client initialization
    try {
      const testResult = await bearCloudGRPC.testAuthentication();
      console.log('✅ gRPC client initialization test completed:', testResult);
      
      return NextResponse.json({
        success: true,
        message: 'gRPC client initialized successfully',
        authenticated: testResult
      });
    } catch (initError) {
      console.error('❌ gRPC client initialization failed:', initError);
      return NextResponse.json({
        success: false,
        error: 'Initialization failed',
        message: initError instanceof Error ? initError.message : 'Unknown init error',
        stack: initError instanceof Error ? initError.stack : undefined
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ Test route error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}