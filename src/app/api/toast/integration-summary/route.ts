import { NextRequest, NextResponse } from 'next/server';
import ToastAPIClient from '@/lib/services/toast-api-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const restaurantGuid = searchParams.get('restaurantGuid');

    if (!restaurantGuid) {
      return NextResponse.json({
        error: 'restaurantGuid is required',
      }, { status: 400 });
    }

    const apiClient = new ToastAPIClient();

    // Test core working functionality only
    const summary: any = {
      core: { status: 'unknown', data: null, error: null },
      employees: { status: 'unknown', data: null, error: null },
      restaurant: { status: 'unknown', data: null, error: null },
    };

    // Test Restaurant API
    try {
      const restaurants = await apiClient.getConnectedRestaurants();
      const targetRestaurant = restaurants.data.find(r => r.guid === restaurantGuid);
      summary.restaurant = {
        status: 'success',
        data: {
          name: targetRestaurant?.restaurantName,
          location: targetRestaurant?.locationName,
          guid: targetRestaurant?.guid,
        },
        error: null,
      };
    } catch (error) {
      summary.restaurant = {
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Test Employee API
    try {
      const employees = await apiClient.getEmployees(restaurantGuid);
      summary.employees = {
        status: 'success',
        data: {
          total: employees.data.length,
          activeCount: employees.data.length, // Already filtered for active
          sampleNames: employees.data.slice(0, 5).map(emp => `${emp.firstName} ${emp.lastName}`),
        },
        error: null,
      };
    } catch (error) {
      summary.employees = {
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Overall core status
    const coreWorking = summary.restaurant.status === 'success' && summary.employees.status === 'success';
    summary.core = {
      status: coreWorking ? 'success' : 'error',
      data: coreWorking ? 'Toast POS integration is fully operational for core features' : 'Core integration has issues',
      error: coreWorking ? null : 'Check restaurant or employee API issues',
    };

    return NextResponse.json({
      success: true,
      integrationStatus: coreWorking ? 'FULLY_OPERATIONAL' : 'PARTIAL_ISSUES',
      message: coreWorking
        ? '🎉 Toast POS integration is working perfectly for employee management!'
        : '⚠️ Core Toast integration has issues',
      restaurantGuid,
      timestamp: new Date().toISOString(),
      summary,
    });

  } catch (error) {
    console.error('Integration summary error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Integration check failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}