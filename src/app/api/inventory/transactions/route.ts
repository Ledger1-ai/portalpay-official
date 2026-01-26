import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { InventoryTransaction } from "@/lib/models/InventoryTransaction";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const period = searchParams.get('period') || 'daily'; // daily, weekly, monthly, quarterly, yearly
    const raw = (searchParams.get('raw') || 'false').toLowerCase() === 'true';
    const itemId = searchParams.get('itemId');

    // Build date filter
    const dateFilter: any = {};
    const toStartOfDay = (v: string) => { const d = new Date(v); d.setHours(0,0,0,0); return d; };
    const toEndOfDay = (v: string) => { const d = new Date(v); d.setHours(23,59,59,999); return d; };
    if (startDate) dateFilter.$gte = toStartOfDay(startDate);
    if (endDate) dateFilter.$lte = toEndOfDay(endDate);

    // Build query
    const query: any = {};
    if (Object.keys(dateFilter).length > 0) {
      query.createdAt = dateFilter;
    }
    if (itemId) {
      query.inventoryItem = itemId;
    }

    // Fetch transactions
    const transactions = await InventoryTransaction.find(query)
      .populate('inventoryItem', 'name category unit')
      .sort({ createdAt: 1 });

    if (raw) {
      return NextResponse.json({
        success: true,
        raw: true,
        period,
        totalTransactions: transactions.length,
        dateRange: {
          start: startDate,
          end: endDate
        },
        data: transactions.map((t: any) => ({
          id: t._id,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          transactionType: t.transactionType,
          quantity: t.quantity,
          unit: t.unit,
          unitCost: t.unitCost,
          totalCost: t.totalCost,
          item: t.inventoryItem ? {
            id: t.inventoryItem._id || t.inventoryItem,
            name: t.inventoryItem.name,
            category: t.inventoryItem.category,
            unit: t.inventoryItem.unit
          } : null,
          referenceType: t.referenceType,
          referenceNumber: t.referenceNumber,
        }))
      });
    }

    // Group transactions by period
    const groupedData = groupTransactionsByPeriod(transactions, period);

    // Calculate movement data
    const movementData = calculateMovementData(groupedData, period);

    return NextResponse.json({
      success: true,
      data: movementData,
      period,
      totalTransactions: transactions.length,
      dateRange: {
        start: startDate,
        end: endDate
      }
    });

  } catch (error) {
    console.error('Error fetching inventory transactions:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function groupTransactionsByPeriod(transactions: any[], period: string) {
  const groups: { [key: string]: any[] } = {};

  transactions.forEach(transaction => {
    let key = '';
    const date = new Date(transaction.createdAt);

    switch (period) {
      case 'daily': {
        // Use local date key to avoid UTC shift issues
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        break;
      }
      case 'weekly': {
        const weekStart = new Date(date);
        const dow = weekStart.getDay();
        const diff = (dow + 6) % 7; // Monday start
        weekStart.setDate(weekStart.getDate() - diff);
        key = weekStart.toISOString().split('T')[0];
        break;
      }
      case 'monthly': {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
        break;
      }
      case 'quarterly': {
        const quarter = Math.floor(date.getMonth() / 3) + 1; // 1-4
        key = `${date.getFullYear()}-Q${quarter}`; // YYYY-Qn
        break;
      }
      case 'yearly': {
        key = date.getFullYear().toString();
        break;
      }
      default: {
        key = date.toISOString().split('T')[0];
      }
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(transaction);
  });

  return groups;
}

function calculateMovementData(groupedData: { [key: string]: any[] }, period: string) {
  const movementData = Object.entries(groupedData).map(([dateKey, transactions]) => {
    // Parse local dateKey robustly (YYYY-MM-DD | YYYY-MM | YYYY | YYYY-Qn)
    let date: Date;
    const key = String(dateKey);
    if (key.includes('Q')) {
      const [yearStr, qStr] = key.split('-');
      const year = Number(yearStr);
      const q = Number((qStr || 'Q1').replace('Q','')) || 1;
      date = new Date(year, (q - 1) * 3, 1);
    } else if (key.length === 4) {
      date = new Date(Number(key), 0, 1);
    } else if (key.length === 7) {
      const [y, m] = key.split('-');
      date = new Date(Number(y), Number(m) - 1, 1);
    } else {
      const [y, m, d] = key.split('-');
      date = new Date(Number(y), Number(m) - 1, Number(d));
    }
    
    // Calculate totals for different transaction types
    const received = transactions
      .filter(t => ['purchase', 'receiving', 'transfer_in', 'production', 'return'].includes(t.transactionType))
      .reduce((sum, t) => sum + Math.abs(t.quantity), 0);

    const usage = transactions
      .filter(t => ['sale', 'consumption', 'waste', 'transfer_out', 'expiry', 'theft'].includes(t.transactionType))
      .reduce((sum, t) => sum + Math.abs(t.quantity), 0);

    const adjustments = transactions
      .filter(t => ['adjustment', 'count_adjustment'].includes(t.transactionType))
      .reduce((sum, t) => sum + t.quantity, 0);

    const totalValue = transactions.reduce((sum, t) => sum + Math.abs(t.totalCost), 0);

    // Format date based on period
    let displayDate = '';
    switch (period) {
      case 'daily': {
        displayDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        break;
      }
      case 'weekly': {
        const weekEnd = new Date(date);
        weekEnd.setDate(date.getDate() + 6);
        displayDate = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        break;
      }
      case 'monthly': {
        displayDate = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        break;
      }
      case 'quarterly': {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        displayDate = `Q${quarter} ${date.getFullYear()}`;
        break;
      }
      case 'yearly': {
        displayDate = date.getFullYear().toString();
        break;
      }
      default: {
        displayDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }

    // Include shortfall (missed/outstanding) if provided by resolver supplement
    const shortfallMap: Map<string, number> | undefined = (global as any).__inv_shortfall;
    return {
      date: displayDate,
      dateKey,
      received,
      usage,
      adjustments,
      totalValue,
      netMovement: received - usage + adjustments,
      transactionCount: transactions.length,
      shortfall: shortfallMap ? (shortfallMap.get(dateKey) || 0) : 0
    };
  });

  // Sort by date
  return movementData.sort((a, b) => new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime());
}