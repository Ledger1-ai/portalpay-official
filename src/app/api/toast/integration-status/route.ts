import { NextRequest, NextResponse } from 'next/server';
import ToastCompleteAPI from '@/lib/services/toast-complete-api';
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

    const toastAPI = new ToastCompleteAPI();
    const apiClient = new ToastAPIClient();

    // Test Standard API integrations only
    const integrationStatus: any = {
      restaurant: { status: 'unknown', data: null, error: null },
      employees: { status: 'unknown', data: null, error: null },
      // Note: Analytics, Orders, and Menus require Premium Toast API access
    };

    // Test Restaurant API
    try {
      const restaurants = await apiClient.getConnectedRestaurants();
      const targetRestaurant = restaurants.data.find(r => r.guid === restaurantGuid);
      integrationStatus.restaurant = {
        status: 'success',
        data: targetRestaurant,
        error: null,
      };
    } catch (error) {
      integrationStatus.restaurant = {
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Test Employee API
    try {
      const employees = await apiClient.getEmployees(restaurantGuid);
      integrationStatus.employees = {
        status: 'success',
        data: { count: employees.data.length, sample: employees.data.slice(0, 3) },
        error: null,
      };
    } catch (error) {
      integrationStatus.employees = {
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Note: Analytics, Orders, and Menus APIs require Premium Toast API access
    // Your Standard Toast API includes: Restaurants, Employees, Labor, Configuration

    // Calculate overall status for Standard API
    const successCount = Object.values(integrationStatus).filter((s: any) => s.status === 'success').length;
    const totalCount = Object.keys(integrationStatus).length;
    const overallStatus = successCount === totalCount ? 'standard_api_fully_integrated' :
      successCount > 0 ? 'standard_api_partially_integrated' : 'not_integrated';

    return NextResponse.json({
      success: true,
      overallStatus,
      integrationHealth: `${successCount}/${totalCount} Standard APIs working`,
      apiTier: 'Standard Toast API',
      availableFeatures: ['Restaurants', 'Employees', 'Labor', 'Configuration'],
      premiumFeatures: ['Analytics', 'Orders', 'Menus', 'Cash Management'],
      restaurantGuid,
      timestamp: new Date().toISOString(),
      integrations: integrationStatus,
    });

  } catch (error) {
    console.error('Integration status error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Integration status check failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}