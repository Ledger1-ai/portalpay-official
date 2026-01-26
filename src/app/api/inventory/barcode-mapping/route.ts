import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { InventoryItem } from "@/lib/models/InventoryItem";

// Lookup item by barcode mapping
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get('barcode');
    
    if (!barcode) {
      return NextResponse.json({ error: 'Barcode parameter required' }, { status: 400 });
    }

    // Look for item with this barcode mapping
    const item = await InventoryItem.findOne({
      $or: [
        { 'barcodeMapping.scannedBarcode': barcode },
        { barcode: barcode }
      ]
    });

    if (item) {
      return NextResponse.json({
        found: true,
        item: {
          _id: item._id,
          name: item.name,
          category: item.category,
          syscoSKU: item.syscoSKU,
          vendorSKU: item.vendorSKU,
          syscoCategory: item.syscoCategory,
          barcodeMapping: item.barcodeMapping,
          costPerUnit: item.costPerUnit,
          unit: item.unit,
          supplier: item.supplier,
          casePackSize: item.casePackSize,
          vendorCode: item.vendorCode,
          leadTimeDays: item.leadTimeDays,
          minimumOrderQty: item.minimumOrderQty,
          pricePerCase: item.pricePerCase,
          preferredVendor: item.preferredVendor,
          averageDailyUsage: item.averageDailyUsage,
          seasonalItem: item.seasonalItem,
          notes: item.notes
        }
      });
    }

    return NextResponse.json({ found: false });
  } catch (error) {
    console.error('Barcode lookup error:', error);
    return NextResponse.json({ error: 'Failed to lookup barcode' }, { status: 500 });
  }
}

// Map barcode to existing item
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    
    const body = await request.json();
    const { itemId, scannedBarcode, mappedBy = 'system' } = body;

    if (!itemId || !scannedBarcode) {
      return NextResponse.json({ error: 'Item ID and scanned barcode required' }, { status: 400 });
    }

    // Check if barcode is already mapped to a different item
    const existingMapping = await InventoryItem.findOne({
      _id: { $ne: itemId },
      $or: [
        { 'barcodeMapping.scannedBarcode': scannedBarcode },
        { barcode: scannedBarcode }
      ]
    });

    if (existingMapping) {
      return NextResponse.json({
        error: 'Barcode already mapped to another item',
        conflictItem: {
          _id: existingMapping._id,
          name: existingMapping.name,
          syscoSKU: existingMapping.syscoSKU
        }
      }, { status: 409 });
    }

    // Update item with barcode mapping
    const updatedItem = await InventoryItem.findByIdAndUpdate(
      itemId,
      {
        $set: {
          'barcodeMapping.scannedBarcode': scannedBarcode,
          'barcodeMapping.mappedAt': new Date(),
          'barcodeMapping.mappedBy': mappedBy,
          'barcodeMapping.confidence': 'high',
          'barcodeMapping.verified': false
        }
      },
      { new: true }
    );

    if (!updatedItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Barcode mapped successfully',
      item: updatedItem
    });
  } catch (error) {
    console.error('Barcode mapping error:', error);
    return NextResponse.json({ error: 'Failed to map barcode' }, { status: 500 });
  }
}

// Verify barcode mapping
export async function PATCH(request: NextRequest) {
  try {
    await connectDB();
    
    const body = await request.json();
    const { itemId, verified } = body;

    if (!itemId || verified === undefined) {
      return NextResponse.json({ error: 'Item ID and verified status required' }, { status: 400 });
    }

    const updatedItem = await InventoryItem.findByIdAndUpdate(
      itemId,
      {
        $set: {
          'barcodeMapping.verified': verified
        }
      },
      { new: true }
    );

    if (!updatedItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: verified ? 'Mapping verified' : 'Mapping unverified',
      item: updatedItem
    });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Failed to update verification' }, { status: 500 });
  }
}