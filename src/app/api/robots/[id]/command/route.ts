import { NextRequest, NextResponse } from 'next/server';
import { bearCloudGRPC } from '@/lib/services/bear-cloud-grpc';

export async function POST(
  request: NextRequest,
  { params }: any
) {
  try {
    console.log(`📡 API Route: Sending command to robot ${params.id} via gRPC`);
    
    const body = await request.json();
    const { command, params: commandParams } = body;
    
    if (!command) {
      return NextResponse.json({
        success: false,
        error: 'Command is required'
      }, { status: 400 });
    }
    
    const success = await bearCloudGRPC.sendRobotCommand(params.id, command);
    
    return NextResponse.json({
      success,
      message: success 
        ? `Command '${command}' sent successfully to robot ${params.id}`
        : `Failed to send command '${command}' to robot ${params.id}`
    });
  } catch (error) {
    console.error(`❌ API Route error sending command to robot ${params.id}:`, error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to send command',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}