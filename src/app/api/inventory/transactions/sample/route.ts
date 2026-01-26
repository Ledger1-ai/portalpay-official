import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { InventoryTransaction } from "@/lib/models/InventoryTransaction";
import { InventoryItem } from "@/lib/models/InventoryItem";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Get all inventory items to create sample transactions
    const inventoryItems = await InventoryItem.find().limit(10);

    if (inventoryItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No inventory items found. Please add some inventory items first.'
      }, { status: 400 });
    }

    const sampleTransactions: any[] = [];
    const today = new Date();

    // Generate sample transactions for the last 30 days
    for (let i = 30; i >= 0; i--) {
      const transactionDate = new Date(today);
      transactionDate.setDate(today.getDate() - i);

      // Create 2-5 transactions per day
      const transactionsPerDay = Math.floor(Math.random() * 4) + 2;

      for (let j = 0; j < transactionsPerDay; j++) {
        const randomItem = inventoryItems[Math.floor(Math.random() * inventoryItems.length)];
        const transactionTypes = [
          'purchase', 'sale', 'consumption', 'waste', 'adjustment',
          'receiving', 'transfer_in', 'transfer_out', 'production'
        ];
        const randomType = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];

        // Generate realistic quantities based on transaction type
        let quantity = 0;
        let balanceChange = 0;

        switch (randomType) {
          case 'purchase':
          case 'receiving':
          case 'transfer_in':
          case 'production':
            quantity = Math.floor(Math.random() * 50) + 10; // 10-60 units
            balanceChange = quantity;
            break;
          case 'sale':
          case 'consumption':
          case 'waste':
          case 'transfer_out':
            quantity = Math.floor(Math.random() * 30) + 5; // 5-35 units
            balanceChange = -quantity;
            break;
          case 'adjustment':
            quantity = Math.floor(Math.random() * 20) - 10; // -10 to +10 units
            balanceChange = quantity;
            break;
          default:
            quantity = Math.floor(Math.random() * 10) + 1;
            balanceChange = quantity;
        }

        const currentBalance = randomItem.currentStock || 100;
        const newBalance = Math.max(0, currentBalance + balanceChange);

        sampleTransactions.push({
          inventoryItem: randomItem._id,
          itemName: randomItem.name,
          transactionType: randomType,
          quantity: Math.abs(quantity),
          unit: randomItem.unit || 'units',
          unitCost: randomItem.costPerUnit || 5.00,
          totalCost: Math.abs(quantity) * (randomItem.costPerUnit || 5.00),
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          location: randomItem.location || 'Main Storage',
          reason: getReasonForTransaction(randomType),
          referenceType: 'Manual',
          referenceNumber: `REF-${Date.now()}-${j}`,
          createdBy: null, // In production, this would be the current user
          createdAt: transactionDate,
          updatedAt: transactionDate
        });

        // Update the item's current stock for the next transaction
        randomItem.currentStock = newBalance;
      }
    }

    // Insert all sample transactions
    const insertedTransactions = await InventoryTransaction.insertMany(sampleTransactions);

    return NextResponse.json({
      success: true,
      message: `Created ${insertedTransactions.length} sample transactions`,
      data: {
        transactionCount: insertedTransactions.length,
        dateRange: {
          start: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: today.toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Error creating sample transactions:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function getReasonForTransaction(transactionType: string): string {
  const reasons: { [key: string]: string[] } = {
    purchase: ['Supplier delivery', 'Emergency stock purchase', 'Bulk order'],
    sale: ['Customer order', 'Catering event', 'Daily service'],
    consumption: ['Kitchen usage', 'Recipe preparation', 'Daily cooking'],
    waste: ['Expired items', 'Damaged goods', 'Overproduction'],
    adjustment: ['Inventory count correction', 'System sync', 'Manual adjustment'],
    receiving: ['Scheduled delivery', 'Vendor shipment', 'Transfer receipt'],
    transfer_in: ['From other location', 'Internal transfer', 'Department move'],
    transfer_out: ['To other location', 'Internal transfer', 'Department allocation'],
    production: ['Kitchen production', 'Prep work', 'Made in-house']
  };

  const reasonList = reasons[transactionType] || ['General transaction'];
  return reasonList[Math.floor(Math.random() * reasonList.length)];
}