import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { InventoryItem } from '@/lib/models/InventoryItem';

export async function GET() {
  try {
    await connectDB();
    
    // Get the schema definition for the category field
    const schema = InventoryItem.schema.paths.category;
    const enumValues = (schema as any).enumValues || (schema as any).options?.enum;
    
    return NextResponse.json({
      success: true,
      categoryEnum: enumValues,
      schemaPath: schema.path,
      schemaType: schema.instance
    });
    
  } catch (error) {
    console.error('Schema check error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check schema',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}