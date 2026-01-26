import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import mongoose from 'mongoose';

export async function GET() {
  try {
    console.log('🔍 Debug endpoint called');

    // Check environment variables
    const envVars = {
      MONGODB_URI: process.env.MONGODB_URI ? 'SET' : 'MISSING',
      MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ? 'SET' : 'MISSING',
      NODE_ENV: process.env.NODE_ENV || 'undefined',
      DEMO_MODE: process.env.DEMO_MODE || 'undefined'
    };

    console.log('📋 Environment Variables:', envVars);

    // Try database connection
    console.log('🔌 Attempting database connection...');
    await connectDB();

    console.log('✅ Database connection successful');
    console.log('📊 Connection details:', {
      readyState: mongoose.connection.readyState,
      name: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port
    });

    // Try a simple database operation
    console.log('🧪 Testing database operations...');
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database object not available');
    }

    // List collections
    const collections = await db.listCollections().toArray();
    console.log('📁 Available collections:', collections.map(c => c.name));

    return NextResponse.json({
      success: true,
      message: 'Debug successful',
      envVars,
      dbConnection: {
        readyState: mongoose.connection.readyState,
        name: mongoose.connection.name,
        host: mongoose.connection.host,
        collections: collections.map(c => c.name)
      }
    });

  } catch (error: any) {
    console.error('❌ Debug failed:', error);

    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      envVars: {
        MONGODB_URI: process.env.MONGODB_URI ? 'SET' : 'MISSING',
        MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ? 'SET' : 'MISSING',
        NODE_ENV: process.env.NODE_ENV || 'undefined'
      }
    }, { status: 500 });
  }
}
