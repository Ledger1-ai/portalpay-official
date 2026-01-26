import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { isDemoMode } from '@/lib/config/demo';
import SevenShiftsApiClient from '@/lib/services/seven-shifts-api-client';
import ToastEmployee from '@/lib/models/ToastEmployee';
import type { IToastEmployee } from '@/lib/models/ToastEmployee';

// Optional: RoleMapping model to normalize departments
async function loadRoleMappings() {
  try {
    const RoleMapping = (await import('@/lib/models/RoleMapping')).default as any;
    const rows = await RoleMapping.find({}).lean();
    const bySevenName = new Map<string, { department: string }>();
    for (const r of rows) {
      if (r?.sevenShiftsRoleName) bySevenName.set(String(r.sevenShiftsRoleName).toLowerCase(), { department: r.department });
    }
    return bySevenName;
  } catch {
    return new Map<string, { department: string }>();
  }
}

function inferDepartment(roleName: string): string {
  const t = (roleName || '').toLowerCase();
  if (!t) return 'Other';
  // Admin
  if (t.includes('manager') || t.includes('supervisor') || t.includes('admin') || t.includes('owner') || t.includes('director')) return 'Admin';
  // FOH
  if (t.includes('server') || t.includes('host') || t.includes('hostess') || t.includes('bartender') || t.includes('runner') || t.includes('busser') || t.includes('barback') || t.includes('cashier') || t.includes('expo') || t.includes('front')) return 'Front of House';
  // BOH
  if (t.includes('chef') || t.includes('cook') || t.includes('kitchen') || t.includes('prep') || t.includes('dish') || t.includes('line') || t.includes('sous') || t.includes('pastry') || t.includes('back')) return 'Back of House';
  return 'Other';
}

export async function GET(_req: NextRequest) {
  try {
    await connectDB();
    if (isDemoMode()) {
      // Demo departments summary (Kitchen/Front/Admin/Other)
      return NextResponse.json({ success: true, data: [
        { name: 'Front of House', members: 8, toastGuids: [] },
        { name: 'Back of House', members: 7, toastGuids: [] },
        { name: 'Admin', members: 2, toastGuids: [] },
      ] });
    }
    const accessToken = process.env['SEVENSHIFTS_ACCESS_TOKEN'];
    if (!accessToken) return NextResponse.json({ success: false, error: '7shifts Access Token is not configured' }, { status: 500 });

    const client = new SevenShiftsApiClient(accessToken);
    const { companyId, companyGuid, locationIds } = await client.getCompanyAndLocations();
    const ctx = { companyId, companyGuid } as { companyId: number; companyGuid?: string };

    // Load role mappings once
    const roleMap = await loadRoleMappings();

    // Fetch users across locations (dedupe by user id)
    const seen = new Set<number>();
    const users: Array<{ id: number; first_name: string; last_name: string; email?: string }>= [];
    const locs = (locationIds && locationIds.length ? locationIds : [0]).map(String);
    for (const loc of locs) {
      try {
        const list = await client.listUsers(loc, ctx);
        for (const u of list) {
          if (!seen.has(u.id)) { seen.add(u.id); users.push(u as any); }
        }
      } catch (e) {
        // continue on location errors
        console.log('7shifts department-overview: listUsers failed for location', loc, e);
      }
    }

    // For each user, get their role assignments; use primary role if present
    const deptToToastGuids = new Map<string, Set<string>>();
    const deptToCount = new Map<string, number>();

    for (const u of users) {
      let roleName = '';
      try {
        const roles = await client.getUserRoleAssignments(u.id, companyId);
        const primary = roles.find(r => r.is_primary) || roles[0];
        roleName = primary?.name || '';
      } catch (e) {
        // ignore role errors
      }
      let dept = 'Other';
      if (roleName) {
        const mapped = roleMap.get(roleName.toLowerCase());
        dept = mapped?.department || inferDepartment(roleName);
      }

      deptToCount.set(dept, (deptToCount.get(dept) || 0) + 1);

      // Try to map to Toast employee to collect toastGuids for client-side rating aggregation
      try {
        const toastEmp = await ToastEmployee.findOne({ sevenShiftsId: u.id }).lean() as IToastEmployee | null;
        if (toastEmp?.toastGuid) {
          if (!deptToToastGuids.has(dept)) deptToToastGuids.set(dept, new Set());
          deptToToastGuids.get(dept)!.add(String(toastEmp.toastGuid));
        }
      } catch {}
    }

    const result = Array.from(deptToCount.entries()).map(([name, members]) => ({
      name,
      members,
      toastGuids: Array.from(deptToToastGuids.get(name) || []),
    })).sort((a,b)=> b.members - a.members);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('7shifts department-overview failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


