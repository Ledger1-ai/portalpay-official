import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import ToastEmployee from '@/lib/models/ToastEmployee';

export async function POST(
  request: NextRequest,
  { params }: any
) {
  try {
    await connectDB();
    
    const resolvedParams = await params;
    const employeeId = resolvedParams.id;
    console.log('Marking employee as locally deleted:', employeeId);
    
    // Find employee by toastGuid
    const employee = await ToastEmployee.findOne({ toastGuid: employeeId });
    
    if (!employee) {
      return NextResponse.json({
        success: false,
        error: 'Employee not found'
      }, { status: 404 });
    }
    
    // Mark as locally deleted (this hides them but preserves Toast sync)
    console.log(`Before setting isLocallyDeleted:`, employee.isLocallyDeleted);
    employee.isLocallyDeleted = true;
    console.log(`After setting isLocallyDeleted:`, employee.isLocallyDeleted);
    
    const savedEmployee = await employee.save();
    console.log(`After saving - isLocallyDeleted:`, savedEmployee.isLocallyDeleted);
    
    console.log(`Employee ${employee.firstName} ${employee.lastName} marked as locally deleted`);
    
    return NextResponse.json({
      success: true,
      message: 'Employee marked as deleted',
      employee: {
        toastGuid: employee.toastGuid,
        name: `${employee.firstName} ${employee.lastName}`,
        isLocallyDeleted: employee.isLocallyDeleted
      }
    });
    
  } catch (error) {
    console.error('Error marking employee as deleted:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete employee'
    }, { status: 500 });
  }
}

// Restore a locally deleted employee
export async function DELETE(
  request: NextRequest,
  { params }: any
) {
  try {
    await connectDB();
    
    const resolvedParams = await params;
    const employeeId = resolvedParams.id;
    console.log('Restoring locally deleted employee:', employeeId);
    
    // Find employee by toastGuid
    const employee = await ToastEmployee.findOne({ toastGuid: employeeId });
    
    if (!employee) {
      return NextResponse.json({
        success: false,
        error: 'Employee not found'
      }, { status: 404 });
    }
    
    // Restore employee (unmark as locally deleted)
    employee.isLocallyDeleted = false;
    await employee.save();
    
    console.log(`Employee ${employee.firstName} ${employee.lastName} restored`);
    
    return NextResponse.json({
      success: true,
      message: 'Employee restored',
      employee: {
        toastGuid: employee.toastGuid,
        name: `${employee.firstName} ${employee.lastName}`,
        isLocallyDeleted: employee.isLocallyDeleted
      }
    });
    
  } catch (error) {
    console.error('Error restoring employee:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore employee'
    }, { status: 500 });
  }
}