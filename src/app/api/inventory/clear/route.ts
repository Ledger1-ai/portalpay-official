import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { InventoryItem } from '@/lib/models/InventoryItem';

export async function DELETE() {
  try {
    console.log('🗑️ Starting inventory clear...');
    
    await connectDB();
    
    // Count items before deletion
    const countBefore = await InventoryItem.countDocuments({});
    console.log(`📊 Found ${countBefore} items to delete`);
    
    // Delete all inventory items
    const result = await InventoryItem.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} inventory items`);
    
    return NextResponse.json({
      success: true,
      deleted: result.deletedCount,
      message: `Successfully deleted ${result.deletedCount} inventory items`
    });
    
  } catch (error) {
    console.error('❌ Error clearing inventory:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to clear inventory',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}