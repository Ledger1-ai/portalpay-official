import { NextRequest, NextResponse } from 'next/server';
import ToastAPIClient from '@/lib/services/toast-api-client';
import { isDemoMode } from '@/lib/config/demo';
import { TeamMember } from '@/lib/models/TeamMember';
import ToastEmployee from '@/lib/models/ToastEmployee';
import { connectDB } from '@/lib/db/connection';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const restaurantGuid = searchParams.get('restaurantGuid');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '100');
    const includeInactive = searchParams.get('includeInactive') === 'true';
    // Accept both legacy and current flags
    const syncFromToast = (searchParams.get('sync') === 'true') || (searchParams.get('syncFromToast') === 'true');

    if (!restaurantGuid) {
      return NextResponse.json({
        error: 'restaurantGuid parameter is required',
      }, { status: 400 });
    }

    await connectDB();

    // In demo mode, serve employees from TeamMember records to avoid any live sources
    if (isDemoMode()) {
      const onlyActive = !includeInactive;
      const members = await TeamMember.find(onlyActive ? { status: 'active' } : {}).lean();
      const mapRoleToJob = (role?: string) => ({ guid: (role || 'Employee').toLowerCase().replace(/\s+/g,'-'), title: role || 'Employee', tip: false });
      const restaurant = 'rest-1';
      const demoEmployees = members.map((m: any) => ({
        id: String(m._id),
        toastGuid: `tm-${String(m._id)}`,
        firstName: (m.name || '').split(' ')[0] || m.name || 'Employee',
        lastName: (m.name || '').split(' ').slice(1).join(' ') || '',
        email: m.email || undefined,
        jobTitles: [mapRoleToJob(m.role)],
        isActive: m.status === 'active',
        lastSyncDate: new Date().toISOString(),
        syncStatus: 'synced',
        isLocallyDeleted: false,
        // enrich with performance aggregates via server-side fetch to /api/performance
        _perf: null,
      }));
      // Fetch aggregates in one call
      let aggregates: Array<{ _id: string; avg?: number; count?: number; red?: number; yellow?: number; blue?: number }> = [];
      try {
        const qs = new URLSearchParams({ restaurantGuid: restaurant }).toString();
        const res = await fetch(`http://localhost:3000/api/performance?${qs}`, { cache: 'no-store' });
        const json = await res.json();
        if (json?.success) aggregates = json.data?.aggregates || [];
      } catch {}
      const aggById = new Map(aggregates.map(a => [String(a._id), a]));
      const withPerf = demoEmployees.map((e) => {
        const a = aggById.get(e.toastGuid);
        return {
          ...e,
          avgRating: (a && typeof a.avg === 'number') ? Number(a.avg.toFixed(2)) : null,
          ratingCount: a?.count || 0,
          flags: { red: a?.red || 0, yellow: a?.yellow || 0, blue: a?.blue || 0 },
        } as any;
      });
      const total = withPerf.length;
      const offset = (page - 1) * pageSize;
      const slice = withPerf.slice(offset, offset + pageSize);
      return NextResponse.json({
        success: true,
        data: slice,
        pagination: { page, pageSize, total, hasMore: offset + slice.length < total },
        timestamp: new Date().toISOString(),
      });
    }

    // Epoch cutoff for Toast placeholder dates
    const epochEnd = new Date('1970-01-02T00:00:00.000Z');

    // Normalize any legacy string deletedDate to Date type so comparisons work
    try {
      await ToastEmployee.updateMany(
        { restaurantGuid, deletedDate: { $type: 'string' } },
        [ { $set: { deletedDate: { $toDate: '$deletedDate' } } } as any ]
      );
    } catch (normErr) {
      console.warn('Normalization (string->date) failed:', normErr);
    }

    // In demo mode, never pull live from Toast
    if (syncFromToast && !isDemoMode()) {
      // Sync employees from Toast API - ONE WAY ONLY (Toast → Varuni)
      const toastClient = new ToastAPIClient();
      const toastEmployees = await toastClient.getEmployees(restaurantGuid, page, pageSize);

      console.log(`Toast API returned ${toastEmployees.data.length} employees for restaurant ${restaurantGuid}`);

      // OVERRIDE STRATEGY: Clear existing local employees that don't match Toast data
      // This ensures Toast is the single source of truth
      const syncResults = {
        processed: 0,
        created: 0,
        updated: 0,
        overridden: 0,
        deactivated: 0,
        errors: 0,
      };

      // First, mark all existing employees as potentially inactive
      await ToastEmployee.updateMany(
        { restaurantGuid },
        { isActive: false, syncStatus: 'pending' }
      );

      // Then process Toast employees (which will reactivate matching ones)
      for (const toastEmp of toastEmployees.data) {
        try {
          syncResults.processed++;

          const existingEmployee = await ToastEmployee.findOne({ toastGuid: toastEmp.guid });
          
          if (existingEmployee) {
            console.log(`Updating existing employee: ${toastEmp.firstName} ${toastEmp.lastName}`);
            
            // ALWAYS update - Toast data overrides local data
            const hadChanges = 
              existingEmployee.firstName !== toastEmp.firstName ||
              existingEmployee.lastName !== toastEmp.lastName ||
              existingEmployee.email !== toastEmp.email;

            existingEmployee.firstName = toastEmp.firstName;
            existingEmployee.lastName = toastEmp.lastName;
            existingEmployee.email = toastEmp.email;
            existingEmployee.jobTitles = toastEmp.jobTitles || [];
            existingEmployee.externalId = toastEmp.externalId;
            existingEmployee.modifiedDate = new Date(toastEmp.modifiedDate);
            existingEmployee.deletedDate = toastEmp.deletedDate ? new Date(toastEmp.deletedDate) : undefined;
            existingEmployee.lastSyncDate = new Date();
            existingEmployee.syncStatus = 'synced';
            existingEmployee.syncErrors = [];
            existingEmployee.isActive = !toastEmp.deletedDate || toastEmp.deletedDate === "1970-01-01T00:00:00.000+0000" || toastEmp.deletedDate.includes("1970-01-01");
            // Preserve local hidden flag; do not override user preference
            
            await existingEmployee.save();
            console.log(`Employee saved: ${existingEmployee.toastGuid}`);
            
            if (hadChanges) {
              syncResults.overridden++;
            } else {
              syncResults.updated++;
            }
          } else {
            console.log(`Creating new employee: ${toastEmp.firstName} ${toastEmp.lastName}`);
            
            // Create new employee from Toast
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
              isLocallyDeleted: false, // New employees are not locally deleted by default
            });
            
            await newEmployee.save();
            console.log(`New employee saved: ${newEmployee.toastGuid}`);
            syncResults.created++;
          }
        } catch (error) {
          console.error(`Error syncing employee ${toastEmp.guid}:`, error);
          console.error('Full error details:', error);
          syncResults.errors++;
        }
      }

      // Count employees that were deactivated (not found in Toast)
      const deactivatedPendingFilter = {
        restaurantGuid,
        isActive: false,
        syncStatus: 'pending'
      } as const;
      const deactivatedCount = await ToastEmployee.countDocuments(deactivatedPendingFilter);
      syncResults.deactivated = deactivatedCount;

      // Stamp a real deletedDate for employees missing from Toast so filters exclude them
      await ToastEmployee.updateMany(
        { ...deactivatedPendingFilter, deletedDate: { $exists: false } },
        { $set: { deletedDate: new Date(), syncStatus: 'synced' } }
      );

      console.log(`Sync completed: ${syncResults.created} created, ${syncResults.updated} updated, ${syncResults.overridden} overridden, ${syncResults.deactivated} deactivated`);

      // Get updated employees from database (exclude real deletedDate)
      console.log(`Retrieving employees from database for restaurant: ${restaurantGuid}`);
      const activeFilter = includeInactive ? {} : { isActive: true };
      const employees = await ToastEmployee.find({ 
        restaurantGuid,
        ...activeFilter,
        $and: [
          { $or: [ { isLocallyDeleted: { $exists: false } }, { isLocallyDeleted: false } ] },
          { $or: [
            { deletedDate: { $exists: false } },
            { deletedDate: null },
            { $expr: { $lte: [ { $toDate: '$deletedDate' }, epochEnd ] } }
          ] }
        ]
      } as any)
        .limit(pageSize)
        .skip((page - 1) * pageSize)
        .sort({ lastSyncDate: -1 });
      
      console.log(`Found ${employees.length} employees in database (excluding locally deleted)`);

      console.log(`Sync completed. Returning ${employees.length} employees with results:`, syncResults);
      
      return NextResponse.json({
        success: true,
        data: employees,
        syncResults,
        pagination: {
          page,
          pageSize,
          hasMore: toastEmployees.hasMore,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Return employees from local database
      console.log(`Loading employees from database for restaurant: ${restaurantGuid}`);
      const activeFilter = includeInactive ? {} : { isActive: true };
      const employees = await ToastEmployee.find({ 
        restaurantGuid,
        ...activeFilter,
        $and: [
          { $or: [ { isLocallyDeleted: { $exists: false } }, { isLocallyDeleted: false } ] },
          { $or: [
            { deletedDate: { $exists: false } },
            { deletedDate: null },
            { $expr: { $lte: [ { $toDate: '$deletedDate' }, epochEnd ] } }
          ] }
        ]
      } as any)
        .limit(pageSize)
        .skip((page - 1) * pageSize)
        .sort({ lastSyncDate: -1 });
      
      console.log(`Found ${employees.length} employees in database (excluding locally deleted)`);

      const totalCount = await ToastEmployee.countDocuments({
        restaurantGuid,
        ...(includeInactive ? {} : { isActive: true }),
        isLocallyDeleted: { $ne: true },
        $or: [
          { deletedDate: { $exists: false } },
          { deletedDate: null },
          { $expr: { $lte: [ { $toDate: '$deletedDate' }, epochEnd ] } }
        ]
      } as any);

      return NextResponse.json({
        success: true,
        data: employees,
        pagination: {
          page,
          pageSize,
          total: totalCount,
          hasMore: (page * pageSize) < totalCount,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Toast employees API error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch employees',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Removed POST - we only sync FROM Toast TO Varuni, not create employees in Toast