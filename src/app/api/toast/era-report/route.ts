import { NextRequest, NextResponse } from 'next/server';
import { ToastAPIClient } from '@/lib/services/toast-api-client';

export async function POST(req: NextRequest) {
  try {
    console.log('Received request to /api/toast/era-report');
    const { startDate, endDate } = await req.json();
    console.log('Request body:', { startDate, endDate });

    if (!startDate || !endDate) {
      console.log('Missing required parameters');
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    console.log('Creating ToastAPIClient');
    const client = new ToastAPIClient();

    console.log('Fetching restaurants...');
    const restaurants = await client.listRestaurants();
    if (restaurants.length === 0) {
      return NextResponse.json({ error: 'No restaurants found' }, { status: 404 });
    }
    const restaurantGuid = restaurants[0].restaurantGuid;
    console.log('Using restaurantGuid:', restaurantGuid);

    console.log('Requesting ERA report...');
    const reportRequestGuid = await client.requestEraReport(restaurantGuid, startDate, endDate);
    console.log('Received reportRequestGuid:', reportRequestGuid);

    // Poll for the report to be ready
    let report;
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`Polling for report, attempt ${i + 1}`);
      report = await client.getEraReport<any>(reportRequestGuid);
      console.log('Report status:', report?.status);
      if (report && report.status === 'COMPLETE') {
        break;
      }
    }

    console.log('Returning report:', report);
    return NextResponse.json(report);
  } catch (error) {
    console.error('Error in /api/toast/era-report:', error);
    return NextResponse.json({ error: (error as any).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ message: 'This endpoint supports POST for creating reports.' });
}
