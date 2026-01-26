import { NextRequest, NextResponse } from 'next/server';
import { processUploadedFloorPlan } from '@/lib/host/image-processor';
import { getEnrichedTableData } from '@/lib/services/toast-tables-client';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File;
    
    if (!imageFile) {
      return NextResponse.json(
        { success: false, error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Process the floor plan image
    console.log('Processing floor plan image...');
    const floorAnalysis = await processUploadedFloorPlan(imageFile);
    
    // Extract table IDs from detected tables
    const detectedTableIds = floorAnalysis.tables.map(table => table.id);
    console.log('Detected table IDs:', detectedTableIds);

    // Fetch Toast POS data for detected tables
    console.log('Fetching Toast POS table data...');
    const toastTableData = await getEnrichedTableData(detectedTableIds);

    // Combine floor analysis with Toast data
    const enrichedTables = floorAnalysis.tables.map(detectedTable => {
      const toastData = toastTableData.tables.find(t => t.id === detectedTable.id);
      return {
        ...detectedTable,
        toastGuid: toastData?.toastData?.guid,
        toastName: toastData?.toastData?.name,
        serviceArea: toastData?.serviceArea,
        revenueCenter: toastData?.revenueCenter,
        hasToastData: !!toastData?.toastData,
      };
    });

    const response = {
      success: true,
      data: {
        // Image analysis results
        analysis: {
          dimensions: floorAnalysis.dimensions,
          tablesDetected: floorAnalysis.tables.length,
          wallsDetected: floorAnalysis.walls.length,
          regionsDetected: floorAnalysis.regions.length,
        },
        
        // Processed table data
        tables: enrichedTables,
        
        // Toast POS integration stats
        toastIntegration: {
          total: toastTableData.stats.total,
          matched: toastTableData.stats.matched,
          unmatched: toastTableData.stats.unmatched,
          matchRate: toastTableData.stats.total > 0 ? 
            (toastTableData.stats.matched / toastTableData.stats.total * 100).toFixed(1) + '%' : '0%',
        },
        
        // Detected regions (for domain mapping)
        colorRegions: floorAnalysis.regions,
        
        // Wall structure
        walls: floorAnalysis.walls,
      },
    };

    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error processing floor image:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process floor image',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch Toast tables without image processing
export async function GET() {
  try {
    // For testing - fetch all Toast tables
    const { ToastTablesClient } = await import('@/lib/services/toast-tables-client');
    const client = new ToastTablesClient();
    const tablesResponse = await client.fetchTables();
    
    return NextResponse.json({
      success: true,
      data: {
        tables: tablesResponse.tables,
        count: tablesResponse.tables.length,
        lastModified: tablesResponse.lastModified,
      },
    });
    
  } catch (error) {
    console.error('Error fetching Toast tables:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch Toast tables',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
