import { NextRequest, NextResponse } from 'next/server';
import ToastAPIClient from '@/lib/services/toast-api-client';
import ToastEmployee from '@/lib/models/ToastEmployee';
import ToastOrder from '@/lib/models/ToastOrder';
import { connectDB } from '@/lib/db/connection';
import { isDemoMode } from '@/lib/config/demo';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const restaurantGuid = searchParams.get('restaurantGuid');
  const syncType = searchParams.get('syncType') || 'all';
  const force = searchParams.get('force') === 'true';

  if (!restaurantGuid) {
    return NextResponse.json({
      error: 'restaurantGuid is required',
    }, { status: 400 });
  }

  if (isDemoMode()) {
    return NextResponse.json({ success: true, message: 'Demo mode: Toast sync disabled' });
  }
  return handleSync({ restaurantGuid, syncType, force });
}

export async function POST(request: NextRequest) {
  try {
    if (isDemoMode()) {
      return NextResponse.json({ success: true, message: 'Demo mode: Toast sync disabled' });
    }
    const body = await request.json();
    const {
      restaurantGuid,
      syncType = 'all',
      force = false,
      dateRange
    } = body;

    if (!restaurantGuid) {
      return NextResponse.json({
        error: 'restaurantGuid is required',
      }, { status: 400 });
    }

    return handleSync({ restaurantGuid, syncType, force, dateRange });
  } catch (error) {
    console.error('POST sync error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Sync request failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

async function handleSync({ restaurantGuid, syncType = 'all', force = false, dateRange = null }: {
  restaurantGuid: string;
  syncType?: string;
  force?: boolean;
  dateRange?: any;
}) {
  try {
    await connectDB();

    const toastClient = new ToastAPIClient();
    const syncResults = {
      employees: { processed: 0, created: 0, updated: 0, errors: 0 },
      orders: { processed: 0, created: 0, updated: 0, errors: 0 },
      startTime: new Date(),
      endTime: null as Date | null,
      success: true,
      errors: [] as string[],
    };

    try {
      // Sync employees if requested
      if (syncType === 'all' || syncType === 'employees') {
        console.log(`Starting employee sync for restaurant ${restaurantGuid}`);

        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const toastEmployees = await toastClient.getEmployees(restaurantGuid, page, 100);

          for (const toastEmp of toastEmployees.data) {
            try {
              syncResults.employees.processed++;

              const existingEmployee = await ToastEmployee.findOne({ toastGuid: toastEmp.guid });

              console.log(`Processing employee: ${toastEmp.firstName} ${toastEmp.lastName} (${toastEmp.guid})`);
              console.log(`Existing employee found: ${!!existingEmployee}`);

              if (existingEmployee) {
                // Only update if data has changed or force sync
                const hasChanges =
                  existingEmployee.modifiedDate.getTime() !== new Date(toastEmp.modifiedDate).getTime() ||
                  force;

                console.log(`Has changes: ${hasChanges}, Force: ${force}`);

                if (hasChanges) {
                  Object.assign(existingEmployee, {
                    firstName: toastEmp.firstName,
                    lastName: toastEmp.lastName,
                    email: toastEmp.email,
                    jobTitles: toastEmp.jobTitles || [],
                    externalId: toastEmp.externalId,
                    modifiedDate: new Date(toastEmp.modifiedDate),
                    deletedDate: toastEmp.deletedDate ? new Date(toastEmp.deletedDate) : undefined,
                    lastSyncDate: new Date(),
                    syncStatus: 'synced',
                    syncErrors: [],
                    isActive: !toastEmp.deletedDate || toastEmp.deletedDate === "1970-01-01T00:00:00.000+0000" || toastEmp.deletedDate.includes("1970-01-01"),
                  });

                  await existingEmployee.save();
                  syncResults.employees.updated++;
                }
              } else {
                // Create new employee
                const newEmployee = new ToastEmployee({
                  toastGuid: toastEmp.guid,
                  restaurantGuid,
                  entityType: toastEmp.entityType,
                  firstName: toastEmp.firstName,
                  lastName: toastEmp.lastName,
                  email: toastEmp.email,
                  jobTitles: toastEmp.jobTitles || [],
                  externalId: toastEmp.externalId,
                  createdDate: new Date(toastEmp.createdDate),
                  modifiedDate: new Date(toastEmp.modifiedDate),
                  deletedDate: toastEmp.deletedDate ? new Date(toastEmp.deletedDate) : undefined,
                  lastSyncDate: new Date(),
                  syncStatus: 'synced',
                  isActive: !toastEmp.deletedDate || toastEmp.deletedDate === "1970-01-01T00:00:00.000+0000" || toastEmp.deletedDate.includes("1970-01-01"),
                });

                await newEmployee.save();
                syncResults.employees.created++;
              }
            } catch (error) {
              console.error(`Error syncing employee ${toastEmp.guid}:`, error);
              syncResults.employees.errors++;
              syncResults.errors.push(`Employee ${toastEmp.guid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }

          hasMore = toastEmployees.hasMore || false;
          page++;
        }

        console.log(`Employee sync completed. Created: ${syncResults.employees.created}, Updated: ${syncResults.employees.updated}, Errors: ${syncResults.employees.errors}`);
      }

      // Skip orders sync for Standard API (Premium feature only)
      if (false && (syncType === 'all' || syncType === 'orders')) { // Disabled for Standard API
        if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
          // Default to last 7 days if no date range provided
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);

          dateRange = {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          };
        }

        console.log(`Starting order sync for restaurant ${restaurantGuid} from ${dateRange.startDate} to ${dateRange.endDate}`);

        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const toastOrders = await toastClient.getOrders(
            restaurantGuid,
            dateRange.startDate,
            dateRange.endDate,
            page,
            100
          );

          for (const toastOrder of toastOrders.data) {
            try {
              syncResults.orders.processed++;

              const existingOrder = await ToastOrder.findOne({ toastGuid: toastOrder.guid });

              if (existingOrder) {
                // Only update if data has changed or force sync
                const hasChanges =
                  existingOrder.modifiedDate.getTime() !== new Date(toastOrder.modifiedDate).getTime() ||
                  force;

                if (hasChanges) {
                  Object.assign(existingOrder, {
                    businessDate: toastOrder.businessDate,
                    diningOption: toastOrder.diningOption,
                    checks: toastOrder.checks,
                    modifiedDate: new Date(toastOrder.modifiedDate),
                    lastSyncDate: new Date(),
                    syncStatus: 'synced',
                    syncErrors: [],
                  });

                  await existingOrder.save();
                  syncResults.orders.updated++;
                }
              } else {
                // Create new order
                const newOrder = new ToastOrder({
                  toastGuid: toastOrder.guid,
                  restaurantGuid,
                  entityType: toastOrder.entityType,
                  businessDate: toastOrder.businessDate,
                  diningOption: toastOrder.diningOption,
                  checks: toastOrder.checks,
                  createdDate: new Date(toastOrder.createdDate),
                  modifiedDate: new Date(toastOrder.modifiedDate),
                  lastSyncDate: new Date(),
                  syncStatus: 'synced',
                  isActive: true,
                });

                await newOrder.save();
                syncResults.orders.created++;
              }
            } catch (error) {
              console.error(`Error syncing order ${toastOrder.guid}:`, error);
              syncResults.orders.errors++;
              syncResults.errors.push(`Order ${toastOrder.guid}: ${(error as any).message || String(error)}`);
            }
          }

          hasMore = toastOrders.hasMore || false;
          page++;
        }

        console.log(`Order sync completed. Created: ${syncResults.orders.created}, Updated: ${syncResults.orders.updated}, Errors: ${syncResults.orders.errors}`);
      }

    } catch (error) {
      console.error('Toast sync error:', error);
      syncResults.success = false;
      syncResults.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    }

    syncResults.endTime = new Date();

    return NextResponse.json({
      success: syncResults.success,
      syncResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Toast sync API error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Sync failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}


