import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/models/User';
import SevenShiftsShift from '@/lib/models/SevenShiftsShift';
import SevenShiftsApiClient from '@/lib/services/seven-shifts-api-client';
import { isDemoMode } from '@/lib/config/demo';
import ToastEmployee from '@/lib/models/ToastEmployee';

async function sync7ShiftsData() {
  console.log('sync7ShiftsData: Starting...');
  const accessToken = process.env['SEVENSHIFTS_ACCESS_TOKEN'];
  console.log('sync7ShiftsData: Access token present:', !!accessToken);
  if (!accessToken) {
    throw new Error('7shifts Access Token is not configured.');
  }

  console.log('sync7ShiftsData: Creating SevenShiftsApiClient...');
  const client = new SevenShiftsApiClient(accessToken);

  // Get company and location information using the robust resolver
  const { companyId, companyGuid, locationIds } = await client.getCompanyAndLocations();

  if (!locationIds.length) {
    console.log('No locations found, but proceeding with company-level sync for companyId:', companyId);
  }

  const locationId = locationIds.length > 0 ? locationIds[0].toString() : '0';
  const context = { companyId, companyGuid };

  // Sync users
  console.log('Syncing users with locationId:', locationId, 'and context:', context);
  const sevenShiftsUsers = await client.listUsers(locationId, context);
  console.log('Found', sevenShiftsUsers.length, '7shifts users');

  let mappedCount = 0;
  for (const sevenShiftsUser of sevenShiftsUsers) {
    console.log(`Processing 7shifts user: ${sevenShiftsUser.first_name} ${sevenShiftsUser.last_name} (ID: ${sevenShiftsUser.id}) - Email: ${sevenShiftsUser.email}`);

    // Get role assignments for this user
    const roleAssignments = await client.getUserRoleAssignments(sevenShiftsUser.id, companyId);
    const primaryRole = roleAssignments.find(role => role.is_primary) || roleAssignments[0];
    const roleName = primaryRole?.name || '';
    console.log(`7shifts user roles:`, roleAssignments.map(r => r.name).join(', '), `(Primary: ${roleName})`);

    // Try external mapping first (original method)
    const mapping = await client.getExternalUserMapping(sevenShiftsUser.id, companyId);
    let updateResult: any = null;

    if (mapping && mapping.external_id) {
      console.log(`Found external_id: ${mapping.external_id}, updating Toast employee...`);
      updateResult = await ToastEmployee.findOneAndUpdate(
        { externalId: mapping.external_id },
        { sevenShiftsId: sevenShiftsUser.id },
        { new: true }
      );

      if (updateResult) {
        console.log(`✅ Mapped via external_id: 7shifts user ${sevenShiftsUser.id} to Toast employee ${mapping.external_id}`);
        mappedCount++;
        continue;
      }
    }

    // Fallback: Match by email (exact match)
    if (sevenShiftsUser.email && sevenShiftsUser.email.trim()) {
      console.log(`Trying to match by email: ${sevenShiftsUser.email}`);
      updateResult = await ToastEmployee.findOneAndUpdate(
        { email: { $regex: new RegExp(`^${sevenShiftsUser.email.trim()}$`, 'i') } },
        { sevenShiftsId: sevenShiftsUser.id },
        { new: true }
      );

      if (updateResult) {
        console.log(`✅ Mapped via email: 7shifts user ${sevenShiftsUser.id} (${sevenShiftsUser.email}) to Toast employee ${updateResult.toastGuid}`);
        mappedCount++;
        continue;
      }
    }

    // Enhanced: Match by name + role combination
    if (sevenShiftsUser.first_name && sevenShiftsUser.last_name) {
      const firstName = sevenShiftsUser.first_name.trim();
      const lastName = sevenShiftsUser.last_name.trim();

      // First try exact name match
      console.log(`Trying to match by name: ${firstName} ${lastName}`);
      updateResult = await ToastEmployee.findOneAndUpdate(
        {
          $and: [
            { firstName: { $regex: new RegExp(`^${firstName}$`, 'i') } },
            { lastName: { $regex: new RegExp(`^${lastName}$`, 'i') } }
          ]
        },
        { sevenShiftsId: sevenShiftsUser.id },
        { new: true }
      );

      if (updateResult) {
        console.log(`✅ Mapped via name: 7shifts user ${sevenShiftsUser.id} (${firstName} ${lastName}) to Toast employee ${updateResult.toastGuid}`);
        mappedCount++;
        continue;
      }

      // If we have a role, try name + similar role match
      if (roleName) {
        console.log(`Trying to match by name + role: ${firstName} ${lastName} with role containing "${roleName}"`);
        // Find Toast employees with similar names and check their job titles
        const potentialMatches = await ToastEmployee.find({
          $and: [
            { firstName: { $regex: new RegExp(`^${firstName}$`, 'i') } },
            { lastName: { $regex: new RegExp(`^${lastName}$`, 'i') } }
          ]
        });

        // Check if any job titles contain similar role names
        for (const potentialMatch of potentialMatches) {
          const hasMatchingRole = potentialMatch.jobTitles?.some((job: { title: string; }) =>
            job.title.toLowerCase().includes(roleName.toLowerCase()) ||
            roleName.toLowerCase().includes(job.title.toLowerCase())
          );

          if (hasMatchingRole) {
            updateResult = await ToastEmployee.findOneAndUpdate(
              { _id: potentialMatch._id },
              { sevenShiftsId: sevenShiftsUser.id },
              { new: true }
            );

            if (updateResult) {
              console.log(`✅ Mapped via name+role: 7shifts user ${sevenShiftsUser.id} (${firstName} ${lastName}, ${roleName}) to Toast employee ${updateResult.toastGuid}`);
              mappedCount++;
              break;
            }
          }
        }

        if (updateResult) continue;
      }
    }

    console.log(`❌ No match found for 7shifts user ${sevenShiftsUser.id} (${sevenShiftsUser.first_name} ${sevenShiftsUser.last_name} - ${sevenShiftsUser.email} - Role: ${roleName})`);
  }

  console.log(`User mapping complete: ${mappedCount}/${sevenShiftsUsers.length} users successfully mapped`);

  // Sync shifts
  try {
    console.log('Starting shifts sync...');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    // Format dates as YYYY-MM-DD in Mountain Time for 7shifts API
    const tz = process.env.TOAST_TIMEZONE || 'America/Denver';
    const startDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(startDate);
    const endDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(endDate);

    console.log('Fetching shifts from', startDateStr, 'to', endDateStr, 'for location', locationId);
    const sevenShiftsShifts = await client.listShifts(locationId, startDateStr, endDateStr, context);

    console.log('Found', sevenShiftsShifts.length, 'shifts');
    for (const shift of sevenShiftsShifts) {
      await SevenShiftsShift.findOneAndUpdate(
        { shiftId: shift.id },
        {
          shiftId: shift.id,
          userId: shift.user_id,
          start: new Date(shift.start),
          end: new Date(shift.end),
          lateMinutes: shift.late_minutes,
          locationId: parseInt(locationId),
        },
        { upsert: true }
      );
    }
    console.log('Shifts sync completed successfully');
  } catch (error) {
    console.error('Shifts sync failed, but continuing with user sync:', error);
    // Don't throw - let user sync complete even if shifts fail
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('Starting 7shifts sync...');
    if (isDemoMode()) {
      console.log('Demo mode: skipping 7shifts sync');
      return NextResponse.json({ success: true, message: 'Demo mode: 7shifts sync disabled' });
    }
    await connectDB();
    console.log('Database connected, calling sync7ShiftsData...');
    await sync7ShiftsData();
    console.log('7shifts sync completed successfully');
    return NextResponse.json({ success: true, message: '7shifts data synced successfully.' });
  } catch (error) {
    console.error('7shifts sync failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : '';
    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: errorStack
    }, { status: 500 });
  }
}
