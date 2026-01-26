import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { connectDB } from '@/lib/db/connection';
import { MenuIndex } from '@/lib/models/MenuIndex';
import { MenuMapping } from '@/lib/models/MenuMapping';
import { InventoryItem } from '@/lib/models/InventoryItem';
// @ts-ignore - runtime import for jsPDF autotable
import autoTable from 'jspdf-autotable';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const restaurantGuid = searchParams.get('restaurantGuid');
    const menuGuid = searchParams.get('menuGuid');
    const groupGuid = searchParams.get('groupGuid');
    const toastItemGuid = searchParams.get('toastItemGuid');
    if (!restaurantGuid) return NextResponse.json({ success: false, error: 'restaurantGuid required' }, { status: 400 });

    const index = await MenuIndex.findOne({ restaurantGuid }).lean() as any;
    if (!index) return NextResponse.json({ success: false, error: 'No menus indexed' }, { status: 404 });

    const menusArr = index.menus || [];
    const menu = (menusArr).find((m: any) => !menuGuid || m.guid === menuGuid) || (menusArr)[0];
    if (!menu) return NextResponse.json({ success: false, error: 'Menu not found' }, { status: 404 });

    // Gather items according to scope (menu, group, or single item)
    const gatherItemsWithCategory = (groups: any[], parentPath: string[] = []): Array<{ item: any; categoryPath: string[] }> => {
      const out: Array<{ item: any; categoryPath: string[] }> = [];
      for (const g of (groups || [])) {
        const path = [...parentPath, g.name || 'Category'];
        for (const it of (g.menuItems || [])) out.push({ item: it, categoryPath: path });
        if (g.menuGroups && g.menuGroups.length) out.push(...gatherItemsWithCategory(g.menuGroups, path));
      }
      return out;
    };
    const findGroup = (groups: any[], guid: string): any | null => {
      for (const g of (groups || [])) {
        if (g.guid === guid) return g;
        const child = findGroup(g.menuGroups || [], guid);
        if (child) return child;
      }
      return null;
    };
    const allEntries = gatherItemsWithCategory(menu.menuGroups || []);
    let entries: Array<{ item: any; categoryPath: string[] }> = allEntries;

    // If groupGuid is provided but not found in the selected menu (or menuGuid omitted), search all menus
    if (groupGuid) {
      let g = findGroup(menu.menuGroups || [], groupGuid);
      if (!g && !menuGuid) {
        for (const m of menusArr) { g = findGroup(m.menuGroups || [], groupGuid); if (g) break; }
      }
      if (!g) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });
      entries = gatherItemsWithCategory([g], []);
    }
    if (toastItemGuid) {
      let single = allEntries.find(e => String(e.item?.guid) === String(toastItemGuid));
      if (!single && !menuGuid) {
        // Search across all menus for the item
        outer: for (const m of menusArr) {
          const list = gatherItemsWithCategory(m.menuGroups || []);
          const found = list.find(e => String(e.item?.guid) === String(toastItemGuid));
          if (found) { single = found; break outer; }
        }
      }
      entries = single ? [single] : [];
    }

    const recipes: { name: string; components: any[]; steps: any[]; category: string }[] = [];
    for (const e of entries) {
      const it = e.item;
      const cat = (e.categoryPath || []).join(' > ');
      const map = await MenuMapping.findOne({ restaurantGuid, toastItemGuid: it.guid }).lean() as any;
      if (map && ((((map.components || []).filter((c: any) => c && (c.kind || c.inventoryItem || c.nestedToastItemGuid)).length) || ((map.recipeSteps || []).filter((s: any) => s && (s.instruction || s.step)).length)))) {
        recipes.push({ name: it.name, components: map.components || [], steps: map.recipeSteps || [], category: cat });
      }
    }

    // Build inventory name map for ingredient tables
    const invIdSet = new Set<string>();
    for (const r of recipes) {
      for (const c of (r.components || [])) {
        if (c && c.kind === 'inventory' && c.inventoryItem) invIdSet.add(String(c.inventoryItem));
        for (const oc of (c?.overrides || [])) if (oc && oc.kind === 'inventory' && oc.inventoryItem) invIdSet.add(String(oc.inventoryItem));
      }
    }
    const invDocs = invIdSet.size ? await InventoryItem.find({ _id: { $in: Array.from(invIdSet) } }).select('name unit').lean() : [];
    const invNameMap = new Map<string, { name: string; unit?: string }>(invDocs.map((d: any) => [String(d._id), { name: d.name, unit: d.unit }]));

    const findItemNameByGuid = (guid?: string) => {
      if (!guid) return '';
      for (const m of (menusArr || [])) {
        const stack: any[] = [...(m.menuGroups || [])];
        while (stack.length) {
          const g = stack.pop();
          for (const it of (g.menuItems || [])) if (String(it.guid) === String(guid)) return it.name || guid;
          if (g.menuGroups) stack.push(...g.menuGroups);
        }
      }
      return guid;
    };

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 50;
    const maxWidth = pageWidth - marginLeft * 2;
    let y = 120;

    // Load header image from public/tgl.png
    let headerImg: string | null = null;
    try {
      const imgPath = path.join(process.cwd(), 'varuni-backoffice', 'public', 'tgl.png');
      const altPath = path.join(process.cwd(), 'public', 'tgl.png');
      const chosen = fs.existsSync(imgPath) ? imgPath : (fs.existsSync(altPath) ? altPath : null);
      if (chosen) {
        const buf = fs.readFileSync(chosen);
        headerImg = `data:image/png;base64,${buf.toString('base64')}`;
      }
    } catch {}

    const addHeader = () => {
      const topY = 60;
      if (headerImg) {
        const imgSize = 48;
        const x = marginLeft;
        doc.addImage(headerImg, 'PNG', x, topY, imgSize, imgSize);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        // Align text midline with medallion
        const textY = topY + imgSize / 2 + 5;
        doc.text('Ledger1 Recipes', x + imgSize + 14, textY);
      }
      y = topY + 48 + 28; // push content below header
    };

    const ensureRoom = (needed = 20) => {
      if (y + needed > pageHeight - 60) {
        doc.addPage();
        addHeader();
      }
    };

    const addLine = (text: string, fontSize = 12) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxWidth);
      for (const l of lines) {
        ensureRoom(fontSize + 4);
        doc.text(l, marginLeft, y);
        y += fontSize + 4;
      }
    };

    // First page header
    addHeader();

    const isMenuScope = !groupGuid && !toastItemGuid;
    const renderRecipe = (r: { name: string; components: any[]; steps: any[]; category: string }) => {
      // Title
      addLine(r.name, 15);
      y += 2;
      // Ingredients table
      const rows: Array<Array<string | number>> = [];
      const microtext = (t: string) => `‹ ${t} ›`;
      const pushRow = (name: string, qty: number, unit: string, notes?: string) => {
        rows.push(['', name, isFinite(qty) ? qty : '', unit || '', notes || '']);
      };
      for (const c of (r.components || [])) {
        if (!c) continue;
        if (c.kind === 'inventory') {
          const nm = invNameMap.get(String(c.inventoryItem));
          pushRow(nm?.name || String(c.inventoryItem || ''), Number(c.quantity || 0), String(c.unit || nm?.unit || ''), c.notes);
        } else if (c.kind === 'menu') {
          // If overrides exist, explode them; otherwise show the nested menu item row
          if (Array.isArray(c.overrides) && c.overrides.length) {
            for (const oc of c.overrides) {
              if (oc.kind === 'inventory') {
                const qty = Number(c.quantity || 1) * Number(oc.quantity || 0);
                const nm = invNameMap.get(String(oc.inventoryItem));
                const from = findItemNameByGuid(c.nestedToastItemGuid);
                pushRow(nm?.name || String(oc.inventoryItem || ''), qty, String(oc.unit || nm?.unit || ''), microtext(`from ${from}`));
              } else if (oc.kind === 'menu') {
                const nm = findItemNameByGuid(oc.nestedToastItemGuid);
                const qty = Number(c.quantity || 1) * Number(oc.quantity || 1);
                pushRow(`MENU: ${nm}`, qty, String(oc.unit || 'each'), microtext(`from ${findItemNameByGuid(c.nestedToastItemGuid)}`));
              }
            }
          } else {
            // Opinionated: only show ingredients of nested items; if no overrides are present, omit the parent MENU row
          }
        }
      }
      if (!rows.length) rows.push(['☐', '—', '', '', '']);
      // Render table
      autoTable(doc, {
        head: [[ 'Done', 'Ingredient', 'Qty', 'Unit', 'Notes' ]],
        body: rows as any,
        startY: y,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 11, cellPadding: 6, halign: 'left', valign: 'middle' },
        headStyles: { fillColor: [245,245,245], textColor: 20, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 42, halign: 'center' },
          1: { cellWidth: 260 },
          2: { cellWidth: 60, halign: 'right' },
          3: { cellWidth: 70 },
          4: { cellWidth: 'auto' },
        } as any,
        margin: { left: marginLeft, right: marginLeft },
      });
      // Update y after table
      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 16;

      // Steps
      if ((r.steps || []).length) {
        addLine('Recipe Steps', 13);
        y += 4;
        for (const s of (r.steps || []).sort((a: any, b: any) => Number(a.step) - Number(b.step))) {
          const parts: string[] = [];
          parts.push(`${s.step}. ${s.instruction || ''}`.trim());
          if (s.time) parts.push(`(${s.time} min)`);
          if (s.notes) parts.push(`— ${s.notes}`);
          addLine(parts.join(' '), 11);
          y += 2;
        }
        y += 6;
      }
    };

    // Template mode (sample PDF)
    if (searchParams.get('template')) {
      const sample: typeof recipes = [
        {
          name: 'Sample Dish Name',
          category: 'Sample Category',
          components: [
            { kind: 'inventory', inventoryItem: 'ING-1', quantity: 2, unit: 'oz', notes: 'finely chopped' },
            { kind: 'inventory', inventoryItem: 'ING-2', quantity: 1, unit: 'each' },
            { kind: 'menu', nestedToastItemGuid: 'MENU-123', quantity: 1, unit: 'each', overrides: [
              { kind: 'inventory', inventoryItem: 'ING-3', quantity: 0.5, unit: 'cup' }
            ] },
          ],
          steps: [
            { step: 1, instruction: 'Pre-heat grill to medium-high.', time: 5 },
            { step: 2, instruction: 'Season sample protein and sear each side.', time: 6 },
            { step: 3, instruction: 'Plate with sides and garnish.', time: 3, notes: 'Use fresh herbs' },
          ],
        }
      ];
      // Inject fake inventory names
      invNameMap.set('ING-1', { name: 'Sample Ingredient A', unit: 'oz' });
      invNameMap.set('ING-2', { name: 'Sample Ingredient B', unit: 'each' });
      invNameMap.set('ING-3', { name: 'Sample Ingredient C', unit: 'cup' });
      recipes.push(...sample);
    }

    if (isMenuScope && !searchParams.get('template')) {
      const byCat = new Map<string, typeof recipes>();
      for (const r of recipes) {
        const key = r.category || 'Uncategorized';
        if (!byCat.has(key)) byCat.set(key, []);
        byCat.get(key)!.push(r);
      }
      // Sort categories and recipes by name
      const sortedCats = Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      let firstSection = true;
      for (const [catName, recsUnsorted] of sortedCats) {
        const recs = recsUnsorted.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        if (!firstSection) { doc.addPage(); addHeader(); }
        firstSection = false;
        addLine(`Category: ${catName}`, 16);
        y += 6;
        recs.forEach((r) => { renderRecipe(r); });
      }
    } else {
      recipes
        .sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')) || String(a.name || '').localeCompare(String(b.name || '')))
        .forEach((r, idx) => { if (idx > 0) { doc.addPage(); addHeader(); } if (r.category) addLine(`Category: ${r.category}`, 12); renderRecipe(r); });
    }

    if (!recipes.length) {
      addLine('No mapped recipes found for the selected scope.', 12);
    }

    const arrayBuffer = doc.output('arraybuffer');
    const buffer = Buffer.from(arrayBuffer as ArrayBuffer);

    // Filename logic
    const sanitize = (s: string) => (s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'recipes';
    let filenameBase = '';
    const templateMode = !!searchParams.get('template');
    if (templateMode) {
      filenameBase = 'The_Graine_Ledger_Recipe_Template';
    } else if (toastItemGuid) {
      const nameFromEntries = (entries && entries[0] && (entries[0] as any).item?.name) ? String((entries[0] as any).item.name) : findItemNameByGuid(toastItemGuid);
      filenameBase = nameFromEntries || 'recipe';
    } else if (groupGuid) {
      let groupName = (entries && entries[0] && (entries[0] as any).categoryPath?.length)
        ? String((entries[0] as any).categoryPath.slice(-1)[0])
        : (findGroup(menu.menuGroups || [], groupGuid) as any)?.name || 'category';
      filenameBase = `${menu.name || 'Menu'}_${groupName}_recipes`;
    } else {
      filenameBase = `${menu.name || 'Menu'}_recipes`;
    }
    const filename = `${sanitize(filenameBase)}.pdf`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (e) {
    console.error('GET /api/menu-mappings/export error', e);
    return NextResponse.json({ success: false, error: 'Failed to export recipes' }, { status: 500 });
  }
}


