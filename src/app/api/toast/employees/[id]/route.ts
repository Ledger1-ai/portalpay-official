import { NextRequest, NextResponse } from 'next/server';
import ToastAPIClient from '@/lib/services/toast-api-client';
import ToastEmployee from '@/lib/models/ToastEmployee';
import { connectDB } from '@/lib/db/connection';
import { isDemoMode } from '@/lib/config/demo';

export async function GET(
  request: NextRequest,
  { params }: any
) {
  try {
    const { searchParams } = new URL(request.url);
    // const restaurantGuid = searchParams.get('restaurantGuid');
    const employeeGuid = params.id;

    // if (!restaurantGuid) {
    //   return NextResponse.json({
    //     error: 'restaurantGuid parameter is required',
    //   }, { status: 400 });
    // }

    await connectDB();

    // Try to get from local database first
    let employee = await ToastEmployee.findOne({ toastGuid: employeeGuid });

    if (!employee) {
      // In demo mode, do not call Toast; return not found
      if (isDemoMode()) {
        return NextResponse.json({ success: false, error: 'Not found (demo mode: no live fetch)' }, { status: 404 });
      }
      // If not found locally, fetch from Toast API (non-demo only)
      const toastClient = new ToastAPIClient();
      const { searchParams } = new URL(request.url);
      const restaurantGuid = searchParams.get('restaurantGuid') || '';
      const toastEmployee = await toastClient.getEmployee(restaurantGuid, employeeGuid);
      employee = new ToastEmployee({
        toastGuid: toastEmployee.guid,
        restaurantGuid: restaurantGuid,
        entityType: toastEmployee.entityType,
        firstName: toastEmployee.firstName,
        lastName: toastEmployee.lastName,
        email: toastEmployee.email,
        jobTitles: toastEmployee.jobTitles || [],
        externalId: toastEmployee.externalId,
        createdDate: new Date(toastEmployee.createdDate),
        modifiedDate: new Date(toastEmployee.modifiedDate),
        deletedDate: toastEmployee.deletedDate ? new Date(toastEmployee.deletedDate) : undefined,
        lastSyncDate: new Date(),
        syncStatus: 'synced',
        isActive: !toastEmployee.deletedDate,
      });
      await employee.save();
    }

    return NextResponse.json({
      success: true,
      data: employee,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Toast get employee API error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch employee',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: any
) {
  try {
    if (isDemoMode()) {
      return NextResponse.json({ success: true, message: 'Demo mode: update disabled' });
    }
    const body = await request.json();
    const { restaurantGuid, employeeData } = body;
    const employeeGuid = params.id;

    if (!restaurantGuid || !employeeData) {
      return NextResponse.json({
        error: 'restaurantGuid and employeeData are required',
      }, { status: 400 });
    }

    const toastClient = new ToastAPIClient();
    
    // Update employee in Toast
    const updatedEmployee = await toastClient.updateEmployee(restaurantGuid, employeeGuid, employeeData);

    // Update in local database
    await connectDB();
    const localEmployee = await ToastEmployee.findOne({ toastGuid: employeeGuid });

    if (localEmployee) {
      Object.assign(localEmployee, {
        firstName: updatedEmployee.firstName,
        lastName: updatedEmployee.lastName,
        email: updatedEmployee.email,
        jobTitles: updatedEmployee.jobTitles || [],
        externalId: updatedEmployee.externalId,
        modifiedDate: new Date(updatedEmployee.modifiedDate),
        deletedDate: updatedEmployee.deletedDate ? new Date(updatedEmployee.deletedDate) : undefined,
        lastSyncDate: new Date(),
        syncStatus: 'synced',
        syncErrors: [],
        isActive: !updatedEmployee.deletedDate,
      });

      await localEmployee.save();

      return NextResponse.json({
        success: true,
        data: localEmployee,
        timestamp: new Date().toISOString(),
      });
    } else {
      return NextResponse.json({
        error: 'Employee not found in local database',
      }, { status: 404 });
    }
  } catch (error) {
    console.error('Toast update employee API error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update employee',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: any
) {
  try {
    // In demo mode, only perform local soft delete (already the case below)
    const { searchParams } = new URL(request.url);
    const restaurantGuid = searchParams.get('restaurantGuid');
    const employeeGuid = params.id;

    if (!restaurantGuid) {
      return NextResponse.json({
        error: 'restaurantGuid parameter is required',
      }, { status: 400 });
    }

    await connectDB();

    // Soft delete in local database
    const localEmployee = await ToastEmployee.findOne({ toastGuid: employeeGuid });

    if (localEmployee) {
      localEmployee.isActive = false;
      localEmployee.deletedDate = new Date();
      localEmployee.lastSyncDate = new Date();
      await localEmployee.save();

      return NextResponse.json({
        success: true,
        message: 'Employee deactivated successfully',
        timestamp: new Date().toISOString(),
      });
    } else {
      return NextResponse.json({
        error: 'Employee not found',
      }, { status: 404 });
    }
  } catch (error) {
    console.error('Toast delete employee API error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete employee',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}