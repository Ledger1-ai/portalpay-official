import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import ToastEmployee from '@/lib/models/ToastEmployee';
import ToastOrder from '@/lib/models/ToastOrder';
import crypto from 'crypto';

// Webhook signature verification
function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-toast-signature');
    const webhookSecret = process.env.TOAST_WEBHOOK_SECRET;

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      const isValid = verifyWebhookSignature(body, signature, webhookSecret);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return NextResponse.json({
          error: 'Invalid signature',
        }, { status: 401 });
      }
    }

    const payload = JSON.parse(body);
    const { eventType, restaurantGuid, entityType, data } = payload;

    console.log(`Toast webhook received: ${eventType} for ${entityType}`);

    await connectDB();

    // Handle different webhook events
    switch (eventType) {
      case 'EMPLOYEE_CREATED':
      case 'EMPLOYEE_UPDATED':
        await handleEmployeeWebhook(restaurantGuid, data, eventType);
        break;

      case 'EMPLOYEE_DELETED':
        await handleEmployeeDeleted(restaurantGuid, data);
        break;

      case 'ORDER_CREATED':
      case 'ORDER_UPDATED':
        await handleOrderWebhook(restaurantGuid, data, eventType);
        break;

      case 'ORDER_DELETED':
        await handleOrderDeleted(restaurantGuid, data);
        break;

      default:
        console.log(`Unhandled webhook event type: ${eventType}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      eventType,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Toast webhook processing error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Webhook processing failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

async function handleEmployeeWebhook(
  restaurantGuid: string,
  employeeData: any,
  eventType: string
) {
  try {
    const existingEmployee = await (ToastEmployee as any).findByToastGuid(employeeData.guid);

    if (existingEmployee) {
      // Update existing employee
      Object.assign(existingEmployee, {
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        email: employeeData.email,
        jobTitles: employeeData.jobTitles || [],
        externalId: employeeData.externalId,
        modifiedDate: new Date(employeeData.modifiedDate),
        deletedDate: employeeData.deletedDate ? new Date(employeeData.deletedDate) : undefined,
        lastSyncDate: new Date(),
        syncStatus: 'synced',
        syncErrors: [],
        isActive: !employeeData.deletedDate,
      });

      await existingEmployee.save();
      console.log(`Updated employee ${employeeData.guid} via webhook`);
    } else {
      // Create new employee
      const newEmployee = new ToastEmployee({
        toastGuid: employeeData.guid,
        restaurantGuid,
        entityType: employeeData.entityType,
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        email: employeeData.email,
        jobTitles: employeeData.jobTitles || [],
        externalId: employeeData.externalId,
        createdDate: new Date(employeeData.createdDate),
        modifiedDate: new Date(employeeData.modifiedDate),
        deletedDate: employeeData.deletedDate ? new Date(employeeData.deletedDate) : undefined,
        lastSyncDate: new Date(),
        syncStatus: 'synced',
        isActive: !employeeData.deletedDate,
      });

      await newEmployee.save();
      console.log(`Created employee ${employeeData.guid} via webhook`);
    }
  } catch (error) {
    console.error('Error handling employee webhook:', error);
    throw error;
  }
}

async function handleEmployeeDeleted(restaurantGuid: string, employeeData: any) {
  try {
    const employee = await (ToastEmployee as any).findByToastGuid(employeeData.guid);

    if (employee) {
      employee.isActive = false;
      employee.deletedDate = new Date();
      employee.lastSyncDate = new Date();
      employee.syncStatus = 'synced';

      await employee.save();
      console.log(`Deleted employee ${employeeData.guid} via webhook`);
    }
  } catch (error) {
    console.error('Error handling employee deletion webhook:', error);
    throw error;
  }
}

async function handleOrderWebhook(
  restaurantGuid: string,
  orderData: any,
  eventType: string
) {
  try {
    const existingOrder = await ToastOrder.findOne({ toastGuid: orderData.guid });

    if (existingOrder) {
      // Update existing order
      Object.assign(existingOrder, {
        businessDate: orderData.businessDate,
        diningOption: orderData.diningOption,
        checks: orderData.checks,
        modifiedDate: new Date(orderData.modifiedDate),
        lastSyncDate: new Date(),
        syncStatus: 'synced',
        syncErrors: [],
      });

      await existingOrder.save();
      console.log(`Updated order ${orderData.guid} via webhook`);
    } else {
      // Create new order
      const newOrder = new ToastOrder({
        toastGuid: orderData.guid,
        restaurantGuid,
        entityType: orderData.entityType,
        businessDate: orderData.businessDate,
        diningOption: orderData.diningOption,
        checks: orderData.checks,
        createdDate: new Date(orderData.createdDate),
        modifiedDate: new Date(orderData.modifiedDate),
        lastSyncDate: new Date(),
        syncStatus: 'synced',
        isActive: true,
      });

      await newOrder.save();
      console.log(`Created order ${orderData.guid} via webhook`);
    }
  } catch (error) {
    console.error('Error handling order webhook:', error);
    throw error;
  }
}

async function handleOrderDeleted(restaurantGuid: string, orderData: any) {
  try {
    const order = await ToastOrder.findOne({ toastGuid: orderData.guid });

    if (order) {
      order.isActive = false;
      order.lastSyncDate = new Date();
      order.syncStatus = 'synced';

      await order.save();
      console.log(`Deleted order ${orderData.guid} via webhook`);
    }
  } catch (error) {
    console.error('Error handling order deletion webhook:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  // Webhook health check endpoint
  return NextResponse.json({
    status: 'healthy',
    service: 'toast-webhooks',
    timestamp: new Date().toISOString(),
  });
}