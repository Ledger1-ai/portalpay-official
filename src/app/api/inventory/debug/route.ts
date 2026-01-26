import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { InventoryItem } from "@/lib/models/InventoryItem";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    // Get total count of items in database
    const totalItems = await InventoryItem.countDocuments({});
    
    // Get recent items (last 10)
    const recentItems = await InventoryItem.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name syscoSKU supplier createdAt notes');
    
    // Get items created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const itemsToday = await InventoryItem.find({
      createdAt: { $gte: today }
    }).select('name syscoSKU supplier createdAt notes');
    
    return NextResponse.json({
      success: true,
      stats: {
        totalItems,
        itemsCreatedToday: itemsToday.length,
        recentItems: recentItems.length
      },
      recentItems,
      itemsToday,
      debug: {
        timestamp: new Date().toISOString(),
        query: 'All items from database'
      }
    });
  } catch (error) {
    console.error('Debug inventory error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}