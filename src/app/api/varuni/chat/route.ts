import { NextRequest, NextResponse } from 'next/server';
import sseBus from '@/lib/services/sse-bus';
import { VaruniAgent, createGraphQLTool, createRESTTool } from '@/lib/services/varuni-agent';
import runVaruniLangGraph from '@/lib/services/varuni-langgraph';
import { marked } from 'marked';
import { searchEmbedding } from '@/lib/services/rag';
import ChatSession from '@/lib/models/ChatSession';
import { connectDB } from '@/lib/db/connection';

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { message, toolset, runtime, turnId } = await req.json();
    const activeToolset = (toolset && String(toolset)) || 'main';
    const authHeader = req.headers.get('authorization') || '';
    const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/api/graphql';
    const userId = (() => {
      try {
        const bearer = (authHeader.split(' ')[1] || '');
        const payloadB64 = (bearer.split('.')[1] || '');
        if (!payloadB64) return 'anonymous';
        const json = Buffer.from(payloadB64, 'base64').toString('utf8');
        const payload = JSON.parse(json) || {};
        return payload.userId || 'anonymous';
      } catch {
        return 'anonymous';
      }
    })();
    const userLabel = (() => {
      try {
        const bearer = (authHeader.split(' ')[1] || '');
        const payloadB64 = (bearer.split('.')[1] || '');
        if (!payloadB64) return '';
        const json = Buffer.from(payloadB64, 'base64').toString('utf8');
        const payload = JSON.parse(json) || {};
        const raw = payload.name || payload.given_name || payload.firstName || payload.email || payload.userId || '';
        return typeof raw === 'string' ? raw : '';
      } catch {
        return '';
      }
    })();
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || undefined;

    const agent = new VaruniAgent();
    const toolsets: any[] = [];
    const register = (ts: any) => { toolsets.push(ts); agent.registerToolSet(ts); };
    const isOn = (name: string, fallback = true) => {
      const v = process.env[`VARUNI_TOOLSET_${name.toUpperCase().replace(/[-:]/g,'_')}`];
      return typeof v === 'string' ? v === 'true' : fallback;
    };

    // Register top-level toolset navigator
    if (isOn('main', true)) register({
      name: 'main',
      description: 'Main tools for Varuni. Navigator for toolsets. Use open_* tools to switch context; use back_to_main to return here.',
      tools: [
        { name: 'list_toolsets', description: 'List available toolsets', handler: async () => ({
          toolsets: agent.listToolSets().map(t => ({ name: t.name, description: t.description }))
        }) },
        {
          name: 'list_tools',
          description: 'List the tools inside a specific toolset by name',
          parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
          handler: async (args: any) => {
            const name = String(args.name || '').toLowerCase();
            const sets = agent.listToolSets();
            const ts = sets.find(s => s.name === name);
            return { toolset: name, tools: ts ? ts.tools : [] };
          }
        },
        {
          name: 'open_toolset',
          description: 'Navigate to a specific toolset by name (e.g., inventory, analytics, vendors, orders, scheduling, menus, search, roster, maintenance, gql, rest, knowledge, universal).',
          parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
          handler: async (args: any) => ({ navigate: String(args.name || '').toLowerCase() })
        },
        { name: 'open_inventory', description: 'Open the Inventory toolset.', handler: async () => ({ navigate: 'inventory' }) },
        { name: 'open_analytics', description: 'Open the Analytics toolset.', handler: async () => ({ navigate: 'analytics' }) },
        { name: 'open_vendors', description: 'Open the Vendors toolset.', handler: async () => ({ navigate: 'vendors' }) },
        { name: 'open_orders', description: 'Open the Orders toolset.', handler: async () => ({ navigate: 'orders' }) },
        { name: 'open_scheduling', description: 'Open the Scheduling toolset.', handler: async () => ({ navigate: 'scheduling' }) },
        { name: 'open_menus', description: 'Open the Menus toolset.', handler: async () => ({ navigate: 'menus' }) },
        { name: 'open_search', description: 'Open the Global Search toolset.', handler: async () => ({ navigate: 'search' }) },
        { name: 'open_roster', description: 'Open the Roster toolset.', handler: async () => ({ navigate: 'roster' }) },
        { name: 'open_maintenance', description: 'Open the Maintenance toolset.', handler: async () => ({ navigate: 'maintenance' }) },
        { name: 'open_gql', description: 'Open the GraphQL toolset.', handler: async () => ({ navigate: 'gql' }) },
        { name: 'open_rest', description: 'Open the REST wrappers toolset.', handler: async () => ({ navigate: 'rest' }) },
        { name: 'open_knowledge', description: 'Open the Knowledge toolset.', handler: async () => ({ navigate: 'knowledge' }) },
        { name: 'open_universal', description: 'Open the Universal callers toolset.', handler: async () => ({ navigate: 'universal' }) },
        { name: 'open_seven_shifts', description: 'Open the 7shifts toolset.', handler: async () => ({ navigate: 'seven_shifts' }) },
        { name: 'open_toast', description: 'Open the Toast toolset.', handler: async () => ({ navigate: 'toast' }) },
      ],
    });
    // Universal toolset (generic GraphQL + REST callers)
    if (isOn('universal', true)) register({
      name: 'universal',
      description: 'Generic tools to call any GraphQL operation or internal REST endpoint',
      tools: [
        {
          name: 'graphql_call',
          description: 'Execute an arbitrary GraphQL query or mutation with variables',
          parameters: { type: 'object', properties: { query: { type: 'string' }, variables: { type: 'object' } }, required: ['query'] },
          handler: async (args: any, ctx: any) => ctx.callGraphQL(String(args.query || ''), args?.variables || {}),
        },
        {
          name: 'rest_call',
          description: 'Call an internal REST API endpoint by method and path. Supports path params, query, and body.',
          parameters: { type: 'object', properties: {
            method: { type: 'string', description: 'HTTP method: GET, POST, PUT, PATCH, DELETE' },
            path: { type: 'string', description: 'Path beginning with /api, e.g., /api/inventory/list' },
            pathParams: { type: 'object', description: 'For dynamic segments like [id]' },
            query: { type: 'object' },
            body: { type: 'object' },
            headers: { type: 'object' },
          }, required: ['method','path'], additionalProperties: true },
          handler: async (args: any, ctx: any) => {
            const replacePathParams = (template: string, params?: Record<string, any>) => {
              if (!params) return template;
              return template.replace(/\[(.+?)\]/g, (_m, key) => {
                const v = (params as any)[key];
                if (v === undefined || v === null) throw new Error(`Missing path param: ${key}`);
                return encodeURIComponent(String(v));
              });
            };
            const path = replacePathParams(String(args.path || ''), args?.pathParams);
            if (typeof ctx.callREST === 'function') {
              return await ctx.callREST(path, String(args.method || 'GET'), { query: args?.query, body: args?.body, headers: args?.headers });
            }
            throw new Error('REST caller is not configured');
          },
        },
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ],
    });

    // Inventory toolset
    if (isOn('inventory', true)) register({
      name: 'inventory',
      description: 'Inventory analytics and stock tools',
      tools: [
        {
          name: 'getInventoryAnalyticsSummary',
          description: 'Fetch inventory analytics summary',
          parameters: { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' } }, required: ['startDate','endDate'] },
          handler: async (args: any, ctx: any) => ctx.callGraphQL(
            `query($startDate: Date!, $endDate: Date!){ inventoryAnalyticsSummary(startDate:$startDate,endDate:$endDate){ totalInventoryValue totalItems lowStockItems criticalItems wasteCostInPeriod wasteQtyInPeriod turnoverRatio } }`,
            { startDate: args.startDate, endDate: args.endDate }
          )
        },
        {
          name: 'getLowStockItems',
          description: 'Fetch low stock items',
          parameters: { type: 'object', properties: {} },
          handler: async (_args: any, ctx: any) => ctx.callGraphQL(`query{ lowStockItems{ id name currentStock minThreshold unit costPerUnit status } }`)
        },
        {
          name: 'get_items_by_sysco_category',
          description: 'Return inventory items filtered by InventoryItem.syscoCategory, including id, name, category, syscoCategory, currentStock, unit, costPerUnit, status.',
          parameters: { type: 'object', properties: { syscoCategory: { type: 'string' } }, required: ['syscoCategory'] },
          handler: async (args: any, ctx: any) => {
            const data: any = await ctx.callGraphQL(`query{ inventoryItems{ id name category syscoCategory currentStock unit costPerUnit status } }`);
            const cat = String(args.syscoCategory || '').toLowerCase();
            const items = ((data && data.inventoryItems) || []).filter((it: any) => String(it.syscoCategory || '').toLowerCase() === cat);
            return { count: items.length, items };
          }
        },
        {
          name: 'get_items_by_category',
          description: 'Return inventory items filtered by InventoryItem.category, including id, name, category, syscoCategory, currentStock, unit, costPerUnit, status.',
          parameters: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
          handler: async (args: any, ctx: any) => {
            const data: any = await ctx.callGraphQL(`query{ inventoryItems{ id name category syscoCategory currentStock unit costPerUnit status } }`);
            const cat = String(args.category || '').toLowerCase();
            const items = ((data && data.inventoryItems) || []).filter((it: any) => String(it.category || '').toLowerCase() === cat);
            return { count: items.length, items };
          }
        },
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ],
    });

    // Global RAG search tool
    if (isOn('knowledge', true)) register({
      name: 'knowledge',
      description: 'Vector search over the current graph snapshot',
      tools: [
        {
          name: 'rag_search',
          description: 'Search indexed knowledge and return top matches',
          parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
          handler: async (args: any) => {
            if (process.env.VARUNI_RAG_ENABLED !== 'true') return { results: [] };
            const res = await searchEmbedding('global', String(args.query || ''), Number(args.limit || 5));
            return { results: res };
          }
        },
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) }
      ]
    });

    // Analytics toolset
    if (isOn('analytics', true)) register({
      name: 'analytics',
      description: 'Business KPIs and revenue analytics',
      tools: [
        createGraphQLTool(
          'get_shop_analytics',
          'Fetch shop analytics documents for a given period and optional date range.',
          `query($period:String!,$startDate:Date,$endDate:Date){ shopAnalytics(period:$period,startDate:$startDate,endDate:$endDate){ period date totalRevenue laborRevenue partsRevenue grossProfit vehiclesServiced averageRepairOrder bayUtilization technicianEfficiency diagnosticCaptureRate partsTurnoverDays comebackRate customerSatisfaction firstTimeFixRate openEstimates warrantyClaims topServiceCategories{ category value change } fleetVsRetailMix{ category value change } revenueTrend{ timestamp label value } bayPerformance{ utilization throughput averageCycleTimeMinutes } technicianLeaderboard{ hoursFlagged billedHours efficiency comebacks upsellRate } alerts{ severity title message suggestedAction } } }`
        ),
        createGraphQLTool(
          'get_revenue_analytics',
          'Fetch revenue analytics series between dates (inclusive). Useful for charts and trend analysis.',
          `query($startDate:Date!,$endDate:Date!){ revenueAnalytics(startDate:$startDate,endDate:$endDate){ period date revenue orders avgOrderValue customerSatisfaction tableTurnover totalCustomers repeatCustomers averageWaitTime staffUtilization inventoryValue wastePercentage } }`
        ),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ]
    });

    // Vendors toolset
    if (isOn('vendors', true)) register({
      name: 'vendors',
      description: 'Supplier directory, contacts, and performance',
      tools: [
        createGraphQLTool(
          'get_vendors',
          'List suppliers (vendors) with key attributes, logistics, performance metrics, and contacts.',
          `query{ suppliers{ id name companyName supplierCode type categories status notes preferred logistics{deliveryDays deliveryWindow minimumOrder leadTimeDays freightMethod dropShipAvailable expeditedLeadTimeDays shippingAccount} performanceMetrics{onTimeDeliveryRate qualityScore totalOrders totalSpend averageLeadTimeDays fillRate warrantyClaims lastEvaluation} contacts{ name title email phone mobile isPrimary } } }`
        ),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ]
    });

    // Orders (Purchase Orders) toolset
    if (isOn('orders', true)) register({
      name: 'orders',
      description: 'Purchase orders lifecycle – list, receive, reset',
      tools: [
        createGraphQLTool(
          'get_purchase_orders',
          'Fetch purchase orders, optionally filtered by vendorId and status.',
          `query($vendorId:ID,$status:String){ purchaseOrders(vendorId:$vendorId,status:$status){ id poNumber supplierName status expectedDeliveryDate subtotal total creditTotal createdAt items{ name vendorSKU sku unit unitCost quantityOrdered quantityReceived creditedQuantity totalCost } } }`
        ),
        createGraphQLTool(
          'receive_purchase_order',
          'Receive items on a purchase order. Provide order id and receipts [{inventoryItem,name,quantityReceived,credit}]',
          `mutation($id:ID!,$receipts:[ReceiveItemInput!]!){ receivePurchaseOrder(id:$id,receipts:$receipts){ order{ id poNumber status } missing{ name missingQuantity unitCost totalCredit } totalCredit replacementOrder{ id poNumber status } } }`
        ),
        createGraphQLTool(
          'reset_purchase_order',
          'Reset a purchase order back to an editable state.',
          `mutation($id:ID!){ resetPurchaseOrder(id:$id){ id poNumber status } }`
        ),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ]
    });

    // Scheduling & Team toolset
    if (isOn('scheduling', false)) register({
      name: 'scheduling',
      description: 'Team members and shifts',
      tools: [
        createGraphQLTool(
          'get_team_members',
          'List team members with core profile and performance summary.',
          `query($timeWindow:String){ teamMembers(timeWindow:$timeWindow){ id name email phone role department status joinDate hourlyRate availability skills performance{ rating completedShifts onTimeRate customerRating salesGenerated } } }`
        ),
        createGraphQLTool(
          'get_shifts',
          'Fetch shifts between startDate and endDate (inclusive).',
          `query($startDate:Date,$endDate:Date){ shifts(startDate:$startDate,endDate:$endDate){ id date startTime endTime role assignedTo status notes actualStartTime actualEndTime breakTime teamMember{ id name email role } } }`
        ),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ]
    });

    // Menus & Mappings toolset
    if (isOn('menus', true)) register({
      name: 'menus',
      description: 'Toast menu mapping and capacity/stock checks',
      tools: [
        createGraphQLTool(
          'get_menu_mappings',
          'Fetch menu mappings for a restaurant (optionally filtered by toastItemGuid).',
          `query($restaurantGuid:String!,$toastItemGuid:String){ menuMappings(restaurantGuid:$restaurantGuid,toastItemGuid:$toastItemGuid){ id restaurantGuid toastItemGuid toastItemName components{ kind inventoryItem nestedToastItemGuid quantity unit notes } recipeSteps{ step instruction time notes } computedCostCache lastComputedAt } }`
        ),
        createGraphQLTool(
          'get_menu_item_cost',
          'Compute the cost of a menu item using inventory mappings.',
          `query($restaurantGuid:String!,$toastItemGuid:String!){ menuItemCost(restaurantGuid:$restaurantGuid,toastItemGuid:$toastItemGuid) }`
        ),
        createGraphQLTool(
          'get_menu_item_capacity',
          'Estimate capacity and requirements to produce a quantity of a menu item.',
          `query($restaurantGuid:String!,$toastItemGuid:String!,$quantity:Float){ menuItemCapacity(restaurantGuid:$restaurantGuid,toastItemGuid:$toastItemGuid,quantity:$quantity){ capacity allHaveStock requirements{ inventoryItem unit quantityPerOrder available } } }`
        ),
        createGraphQLTool(
          'get_menu_item_stock',
          'Get stock status for menu items by guid or location ids.',
          `query($search:String){ inventoryItems(search:$search){ id name category currentStock unit status supplierName } }`
        ),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ]
    });

    // Global search toolset
    if (isOn('search', true)) register({
      name: 'search',
      description: 'Cross-panel global search',
      tools: [
        createGraphQLTool(
          'global_search',
          'Search across panels for items, vendors, recipes, etc.',
          `query($query:String!,$limit:Int){ globalSearch(query:$query,limit:$limit){ id kind title description route icon } }`
        ),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ]
    });

    // Roster toolset
    if (isOn('roster', true)) register({
      name: 'roster',
      description: 'Roster configurations',
      tools: [
        createGraphQLTool(
          'get_roster_configurations',
          'List saved roster configurations.',
          `query{ rosterConfigurations{ id name description isActive createdAt updatedAt } }`
        ),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ]
    });

    // Maintenance toolset
    if (isOn('maintenance', true)) register({
      name: 'maintenance',
      description: 'Administrative utilities (reindex knowledge)',
      tools: [
        {
          name: 'reindex_knowledge',
          description: 'Trigger a full RAG reindex of the graph snapshot for improved retrieval.',
          parameters: { type: 'object', properties: { namespace: { type: 'string' } } },
          handler: async (args: any) => {
            try {
              const res = await fetch((process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000') + '/api/varuni/reindex', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namespace: args?.namespace || 'global' })
              });
              const json = await res.json();
              return json;
            } catch (e: any) {
              return { success: false, error: e?.message || 'reindex failed' };
            }
          }
        },
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ]
    });

    // GraphQL comprehensive toolset
    if (isOn('gql', true)) register({
      name: 'gql',
      description: 'All GraphQL queries and mutations as named tools',
      tools: [
        // Queries
        createGraphQLTool('get_me', 'Get current user profile', `query{ me{ id name email role avatar createdAt updatedAt } }`),
        createGraphQLTool('list_users', 'List users', `query{ users{ id name email role avatar createdAt updatedAt } }`),
        createGraphQLTool('get_team_members', 'List team members', `query($timeWindow:String){ teamMembers(timeWindow:$timeWindow){ id name email phone role department status joinDate hourlyRate availability skills performance{ rating completedShifts onTimeRate customerRating salesGenerated history{ date rating } } } }`),
        createGraphQLTool('get_team_member', 'Get a team member by id', `query($id:ID!){ teamMember(id:$id){ id name email phone role department status joinDate hourlyRate availability skills performance{ rating completedShifts onTimeRate customerRating salesGenerated } toastId } }`),
        createGraphQLTool('get_shifts', 'List shifts in range', `query($startDate:Date,$endDate:Date){ shifts(startDate:$startDate,endDate:$endDate){ id date startTime endTime role assignedTo status notes actualStartTime actualEndTime breakTime } }`),
        createGraphQLTool('get_shift', 'Get a shift by id', `query($id:ID!){ shift(id:$id){ id date startTime endTime role assignedTo status notes } }`),
        createGraphQLTool('list_inventory_items', 'List inventory items', `query{ inventoryItems{ id name category currentStock minThreshold parLevel maxCapacity unit costPerUnit supplier lastUpdated status location barcode qrCode expiryDate reorderPoint reorderQuantity restockPeriod restockDays syscoSKU vendorSKU casePackSize vendorCode syscoCategory pricePerCase brand } }`),
        createGraphQLTool('get_inventory_item', 'Get an inventory item by id', `query($id:ID!){ inventoryItem(id:$id){ id name category currentStock minThreshold parLevel maxCapacity unit costPerUnit supplier lastUpdated status location barcode qrCode description expiryDate waste reorderPoint reorderQuantity restockPeriod restockDays brand } }`),
        createGraphQLTool('get_low_stock_items', 'Get low stock items', `query{ lowStockItems{ id name category currentStock minThreshold unit costPerUnit status } }`),
        createGraphQLTool('list_vendors', 'List suppliers (vendors)', `query{ suppliers{ id name companyName supplierCode type categories status preferred contacts{ name title email phone mobile isPrimary } address{ street city state zipCode country } performanceMetrics{ totalOrders totalSpend averageLeadTimeDays onTimeDeliveryRate qualityScore fillRate warrantyClaims lastEvaluation } } }`),
        // Alias name kept; underlying query uses suppliers
        createGraphQLTool('get_vendor', 'Get supplier by id', `query($id:ID!){ suppliers{ id } }`),
        createGraphQLTool('list_invoices', 'List invoices', `query{ invoices{ id invoiceNumber clientName amount tax totalAmount dueDate status issuedDate paidDate paymentMethod } }`),
        createGraphQLTool('get_invoice', 'Get invoice by id', `query($id:ID!){ invoice(id:$id){ id invoiceNumber clientName amount tax totalAmount dueDate status issuedDate paidDate description paymentMethod notes terms } }`),
        createGraphQLTool('get_shop_analytics', 'Get shop analytics by period', `query($period:String!,$startDate:Date,$endDate:Date){ shopAnalytics(period:$period,startDate:$startDate,endDate:$endDate){ period date totalRevenue grossProfit vehiclesServiced averageRepairOrder revenueTrend{ timestamp value } } }`),
        createGraphQLTool('get_inventory_movement', 'Inventory movement series', `query($period:String!,$startDate:Date!,$endDate:Date!,$itemId:ID){ inventoryMovement(period:$period,startDate:$startDate,endDate:$endDate,itemId:$itemId){ date dateKey received usage adjustments totalValue netMovement transactionCount itemsCount } }`),
        createGraphQLTool('get_inventory_analytics_summary', 'Inventory analytics summary', `query($startDate:Date!,$endDate:Date!){ inventoryAnalyticsSummary(startDate:$startDate,endDate:$endDate){ totalInventoryValue totalItems lowStockItems criticalItems wasteCostInPeriod wasteQtyInPeriod turnoverRatio } }`),
        createGraphQLTool('get_abc_analysis', 'ABC analysis', `query($startDate:Date!,$endDate:Date!,$metric:String){ abcAnalysis(startDate:$startDate,endDate:$endDate,metric:$metric){ itemId name value cumulativePct category } }`),
        createGraphQLTool('get_waste_report', 'Waste report', `query($startDate:Date!,$endDate:Date!){ wasteReport(startDate:$startDate,endDate:$endDate){ byReason{ reason quantity cost } byItem{ itemId name quantity cost } totalQuantity totalCost } }`),
        createGraphQLTool('get_supplier_performance_report', 'Supplier performance', `query($startDate:Date!,$endDate:Date!){ supplierPerformanceReport(startDate:$startDate,endDate:$endDate){ supplierId supplierName totalOrders totalSpent averageLeadTimeDays onTimeDeliveryRate qualityScore } }`),
        createGraphQLTool('get_inventory_turnover_series', 'Inventory turnover series', `query($period:String!,$startDate:Date!,$endDate:Date!){ inventoryTurnoverSeries(period:$period,startDate:$startDate,endDate:$endDate){ date period usageCost avgInventoryValue turnover } }`),
        createGraphQLTool('get_recipe_profitability_report', 'Recipe profitability', `query{ recipeProfitabilityReport{ recipeId name foodCost menuPrice foodCostPct grossMargin isPopular } }`),
        createGraphQLTool('get_cross_panel_links', 'Cross-panel links for item ids', `query($itemIds:[ID!]){ crossPanelLinks(itemIds:$itemIds){ itemId itemName vendorNames recipeNames } }`),
        createGraphQLTool('get_service_packages', 'Fetch auto shop service packages filtered by category or search keyword.', `query($category:String,$search:String){ servicePackages(category:$category, search:$search){ id serviceCode name shortName category subcategory description laborHours basePrice bayType skillLevel sameDayEligible warrantyMonths serviceIntervalMiles serviceIntervalMonths } }`),
        createGraphQLTool('get_menu_mappings', 'Menu mappings for a restaurant', `query($restaurantGuid:String!,$toastItemGuid:String){ menuMappings(restaurantGuid:$restaurantGuid,toastItemGuid:$toastItemGuid){ id restaurantGuid toastItemGuid toastItemName components{ kind inventoryItem nestedToastItemGuid modifierOptionGuid quantity unit notes } computedCostCache lastComputedAt } }`),
        createGraphQLTool('get_menu_item_cost', 'Menu item cost', `query($restaurantGuid:String!,$toastItemGuid:String!){ menuItemCost(restaurantGuid:$restaurantGuid,toastItemGuid:$toastItemGuid) }`),
        createGraphQLTool('get_menu_item_capacity', 'Menu item capacity', `query($restaurantGuid:String!,$toastItemGuid:String!,$quantity:Float){ menuItemCapacity(restaurantGuid:$restaurantGuid,toastItemGuid:$toastItemGuid,quantity:$quantity){ capacity allHaveStock requirements{ inventoryItem unit quantityPerOrder available } } }`),
        createGraphQLTool('get_parts_stock', 'Lookup inventory parts with current stock levels', `query($search:String){ inventoryItems(search:$search){ id name category currentStock unit status supplierName } }`),
        createGraphQLTool('get_order_tracking_status', 'Order tracking status', `query($restaurantGuid:String!){ orderTrackingStatus(restaurantGuid:$restaurantGuid){ restaurantGuid enabled lastRunAt lastBusinessDate } }`),
        createGraphQLTool('get_menu_visibility', 'Menu visibility config', `query($restaurantGuid:String!){ menuVisibility(restaurantGuid:$restaurantGuid){ restaurantGuid hiddenMenus hiddenGroups updatedAt } }`),
        createGraphQLTool('get_purchase_orders', 'List purchase orders', `query($vendorId:ID,$status:String){ purchaseOrders(vendorId:$vendorId,status:$status){ id poNumber supplierName status expectedDeliveryDate subtotal total creditTotal createdAt } }`),
        createGraphQLTool('get_purchase_order', 'Get purchase order', `query($id:ID!){ purchaseOrder(id:$id){ id poNumber supplierName status orderDate expectedDeliveryDate items{ name quantityOrdered quantityReceived unit unitCost totalCost } subtotal total tax shipping notes createdAt updatedAt } }`),
        createGraphQLTool('get_roster_configurations', 'List roster configurations', `query{ rosterConfigurations{ id name description isActive createdAt updatedAt } }`),
        createGraphQLTool('get_roster_configuration', 'Get roster configuration by name', `query($name:String!){ rosterConfiguration(name:$name){ id name description isActive nodes{ id name department stratum capacity assigned{ userId source displayName rating } } } }`),
        createGraphQLTool('get_active_roster_configuration', 'Get active roster configuration', `query{ activeRosterConfiguration{ id name description isActive } }`),
        createGraphQLTool('get_roster_candidates', 'List roster candidates', `query($includeToastOnly:Boolean,$onlySevenShiftsActive:Boolean){ rosterCandidates(includeToastOnly:$includeToastOnly,onlySevenShiftsActive:$onlySevenShiftsActive){ id name email role roles department toastEnrolled sevenShiftsEnrolled rating } }`),
        createGraphQLTool('get_ai_insights', 'List AI insights', `query($module:String,$forDate:Date,$status:String){ aiInsights(module:$module,forDate:$forDate,status:$status){ id module title description action urgency impact status createdAt } }`),
        createGraphQLTool('get_saved_rosters', 'List saved rosters', `query($startDate:Date!,$endDate:Date!){ savedRosters(startDate:$startDate,endDate:$endDate){ id name rosterDate shift } }`),
        createGraphQLTool('get_saved_roster', 'Get saved roster', `query($id:ID!){ savedRoster(id:$id){ id name rosterDate shift notes nodes{ id name } } }`),
        createGraphQLTool('get_role_mappings', 'List role mappings', `query{ roleMappings{ id sevenShiftsRoleName standardRoleName department stratum } }`),
        // Mutations
        createGraphQLTool('create_user', 'Create user', `mutation($input:CreateUserInput!){ createUser(input:$input){ id name email role } }`),
        createGraphQLTool('update_user', 'Update user', `mutation($id:ID!,$input:UpdateUserInput!){ updateUser(id:$id,input:$input){ id name email role } }`),
        createGraphQLTool('delete_user', 'Delete user', `mutation($id:ID!){ deleteUser(id:$id) }`),
        createGraphQLTool('create_team_member', 'Create team member', `mutation($input:CreateTeamMemberInput!){ createTeamMember(input:$input){ id name email role department } }`),
        createGraphQLTool('update_team_member', 'Update team member', `mutation($id:ID!,$input:UpdateTeamMemberInput!){ updateTeamMember(id:$id,input:$input){ id name role department status } }`),
        createGraphQLTool('delete_team_member', 'Delete team member', `mutation($id:ID!){ deleteTeamMember(id:$id) }`),
        createGraphQLTool('sync_from_toast', 'Sync from Toast', `mutation{ syncFromToast }`),
        createGraphQLTool('create_shift', 'Create shift', `mutation($input:CreateShiftInput!){ createShift(input:$input){ id date startTime endTime role assignedTo status } }`),
        createGraphQLTool('update_shift', 'Update shift', `mutation($id:ID!,$input:UpdateShiftInput!){ updateShift(id:$id,input:$input){ id status notes } }`),
        createGraphQLTool('delete_shift', 'Delete shift', `mutation($id:ID!){ deleteShift(id:$id) }`),
        createGraphQLTool('create_inventory_item', 'Create inventory item', `mutation($input:CreateInventoryItemInput!){ createInventoryItem(input:$input){ id name category unit currentStock } }`),
        createGraphQLTool('update_inventory_item', 'Update inventory item', `mutation($id:ID!,$input:UpdateInventoryItemInput!){ updateInventoryItem(id:$id,input:$input){ id name currentStock status } }`),
        createGraphQLTool('delete_inventory_item', 'Delete inventory item', `mutation($id:ID!){ deleteInventoryItem(id:$id) }`),
        createGraphQLTool('update_stock', 'Update stock quantity', `mutation($id:ID!,$quantity:Float!){ updateStock(id:$id,quantity:$quantity){ id currentStock status } }`),
        createGraphQLTool('record_waste', 'Record inventory waste', `mutation($itemId:ID!,$quantity:Float!,$reason:String!,$notes:String){ recordWaste(itemId:$itemId,quantity:$quantity,reason:$reason,notes:$notes){ id waste currentStock status } }`),
        // Replace vendor mutations with supplier ones matching schema
        createGraphQLTool('create_supplier', 'Create supplier', `mutation($name:String!,$companyName:String!,$type:String!,$categories:[String!],$preferred:Boolean,$notes:String){ createSupplier(name:$name,companyName:$companyName,type:$type,categories:$categories,preferred:$preferred,notes:$notes){ id name companyName preferred status } }`),
        createGraphQLTool('update_supplier', 'Update supplier', `mutation($id:ID!,$type:String,$categories:[String!],$status:String,$preferred:Boolean,$notes:String){ updateSupplier(id:$id,type:$type,categories:$categories,status:$status,preferred:$preferred,notes:$notes){ id name status preferred } }`),
        createGraphQLTool('create_invoice', 'Create invoice', `mutation($input:CreateInvoiceInput!){ createInvoice(input:$input){ id clientName amount dueDate status } }`),
        createGraphQLTool('update_invoice', 'Update invoice', `mutation($id:ID!,$input:UpdateInvoiceInput!){ updateInvoice(id:$id,input:$input){ id amount status } }`),
        createGraphQLTool('delete_invoice', 'Delete invoice', `mutation($id:ID!){ deleteInvoice(id:$id) }`),
        createGraphQLTool('mark_invoice_paid', 'Mark invoice paid', `mutation($id:ID!){ markInvoicePaid(id:$id){ id status paidDate } }`),
        createGraphQLTool('create_purchase_order', 'Create purchase order', `mutation($input:CreatePurchaseOrderInput!){ createPurchaseOrder(input:$input){ id poNumber status } }`),
        createGraphQLTool('update_purchase_order', 'Update purchase order', `mutation($id:ID!,$input:UpdatePurchaseOrderInput!){ updatePurchaseOrder(id:$id,input:$input){ id poNumber status } }`),
        createGraphQLTool('receive_purchase_order', 'Receive purchase order', `mutation($id:ID!,$receipts:[ReceiveItemInput!]!){ receivePurchaseOrder(id:$id,receipts:$receipts){ order{ id poNumber status } missing{ name missingQuantity unitCost totalCredit } totalCredit } }`),
        createGraphQLTool('reset_purchase_order', 'Reset purchase order', `mutation($id:ID!){ resetPurchaseOrder(id:$id){ id poNumber status } }`),
        createGraphQLTool('delete_purchase_order', 'Delete purchase order', `mutation($id:ID!){ deletePurchaseOrder(id:$id) }`),
        createGraphQLTool('create_roster_configuration', 'Create roster configuration', `mutation($input:CreateRosterInput!){ createRosterConfiguration(input:$input){ id name isActive } }`),
        createGraphQLTool('update_roster_configuration', 'Update roster configuration', `mutation($id:ID!,$input:UpdateRosterInput!){ updateRosterConfiguration(id:$id,input:$input){ id name isActive } }`),
        createGraphQLTool('delete_roster_configuration', 'Delete roster configuration', `mutation($id:ID!){ deleteRosterConfiguration(id:$id) }`),
        createGraphQLTool('set_active_roster_configuration', 'Set active roster configuration', `mutation($id:ID!){ setActiveRosterConfiguration(id:$id){ id name isActive } }`),
        createGraphQLTool('index_menus', 'Index menus from Toast', `mutation($restaurantGuid:String!){ indexMenus(restaurantGuid:$restaurantGuid) }`),
        createGraphQLTool('upsert_menu_mapping', 'Upsert menu mapping', `mutation($input:UpsertMenuMappingInput!){ upsertMenuMapping(input:$input){ id toastItemGuid toastItemName components{ kind quantity unit } } }`),
        createGraphQLTool('set_order_tracking', 'Enable/disable order tracking', `mutation($restaurantGuid:String!,$enabled:Boolean!){ setOrderTracking(restaurantGuid:$restaurantGuid,enabled:$enabled){ restaurantGuid enabled lastRunAt } }`),
        createGraphQLTool('run_order_tracking', 'Run order tracking', `mutation($restaurantGuid:String!,$businessDate:String){ runOrderTracking(restaurantGuid:$restaurantGuid,businessDate:$businessDate) }`),
        createGraphQLTool('update_menu_item_stock', 'Update menu item stock', `mutation($restaurantGuid:String!,$updates:[MenuItemStockUpdateInput!]!){ updateMenuItemStock(restaurantGuid:$restaurantGuid,updates:$updates){ guid multiLocationId status quantity versionId } }`),
        createGraphQLTool('update_service_package', 'Update service package pricing or labor hours', `mutation($id:ID!,$input:ServicePackageInput!){ updateServicePackage(id:$id,input:$input){ id serviceCode name category laborHours basePrice sameDayEligible } }`),
        createGraphQLTool('update_vendor_representative', 'Update vendor representative', `mutation($id:ID!,$input:UpdateVendorRepresentativeInput!){ updateVendorRepresentative(id:$id,input:$input){ id name currentRepresentative{ name email phone } } }`),
        createGraphQLTool('save_roster', 'Save roster', `mutation($input:SaveRosterInput!){ saveRoster(input:$input){ id name rosterDate shift } }`),
        createGraphQLTool('update_saved_roster', 'Update saved roster', `mutation($id:ID!,$input:SaveRosterInput!){ updateSavedRoster(id:$id,input:$input){ id name rosterDate shift } }`),
        createGraphQLTool('delete_saved_roster', 'Delete saved roster', `mutation($id:ID!){ deleteSavedRoster(id:$id) }`),
        createGraphQLTool('update_role_mapping', 'Update role mapping', `mutation($id:ID!,$input:RoleMappingInput!){ updateRoleMapping(id:$id,input:$input){ id sevenShiftsRoleName standardRoleName department stratum } }`),
        createGraphQLTool('generate_insights', 'Generate AI insights', `mutation($module:String!,$forDate:Date){ generateInsights(module:$module,forDate:$forDate) }`),
        createGraphQLTool('dismiss_insight', 'Dismiss AI insight', `mutation($id:ID!){ dismissInsight(id:$id) }`),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ],
    });

    // REST endpoints toolset (common wrappers)
    if (isOn('rest', true)) register({
      name: 'rest',
      description: 'Named wrappers for key internal REST endpoints',
      tools: [
        createRESTTool('inventory_list', 'List inventory items (REST)', 'GET', '/api/inventory/list'),
        createRESTTool('inventory_transactions', 'Get inventory transactions', 'GET', '/api/inventory/transactions'),
        createRESTTool('inventory_transactions_sample', 'Generate sample inventory transactions', 'POST', '/api/inventory/transactions/sample'),
        createRESTTool('inventory_waste', 'Get inventory waste logs', 'GET', '/api/inventory/waste'),
        createRESTTool('inventory_csv_import', 'Import inventory items from CSV', 'POST', '/api/inventory/csv-import'),
        createRESTTool('inventory_clear', 'Clear inventory data', 'DELETE', '/api/inventory/clear'),
        createRESTTool('inventory_barcode_mapping_get', 'Get barcode mappings', 'GET', '/api/inventory/barcode-mapping'),
        createRESTTool('inventory_barcode_mapping_post', 'Create barcode mapping', 'POST', '/api/inventory/barcode-mapping'),
        createRESTTool('inventory_barcode_mapping_patch', 'Update barcode mapping', 'PATCH', '/api/inventory/barcode-mapping'),
        createRESTTool('menu_mappings_list', 'List menu mappings (REST)', 'GET', '/api/menu-mappings'),
        createRESTTool('menu_mappings_create', 'Create menu mapping (REST)', 'POST', '/api/menu-mappings'),
        createRESTTool('menu_mappings_capacity', 'Menu mappings capacity', 'GET', '/api/menu-mappings/capacity'),
        createRESTTool('menu_mappings_cost', 'Menu mappings cost', 'GET', '/api/menu-mappings/cost'),
        createRESTTool('menu_mappings_usage', 'Menu mappings usage', 'GET', '/api/menu-mappings/usage'),
        createRESTTool('menu_mappings_export', 'Export menu mappings', 'GET', '/api/menu-mappings/export'),
        createRESTTool('orders_list', 'List purchase orders (REST)', 'GET', '/api/orders'),
        createRESTTool('orders_create', 'Create purchase order (REST)', 'POST', '/api/orders'),
        createRESTTool('order_get', 'Get purchase order by id (REST)', 'GET', '/api/orders/[id]'),
        createRESTTool('order_update', 'Update purchase order by id (REST)', 'PATCH', '/api/orders/[id]'),
        createRESTTool('order_receive', 'Receive purchase order by id (REST)', 'POST', '/api/orders/[id]/receive'),
        createRESTTool('team_list', 'List team members (REST)', 'GET', '/api/team'),
        createRESTTool('team_create', 'Create team member (REST)', 'POST', '/api/team'),
        createRESTTool('team_update', 'Update team member (REST)', 'PUT', '/api/team'),
        createRESTTool('team_delete', 'Delete team member (REST)', 'DELETE', '/api/team'),
        createRESTTool('team_summary', 'Team summary metrics', 'GET', '/api/team/summary'),
        createRESTTool('team_reset_password', 'Reset team member password', 'POST', '/api/team/[id]/reset-password'),
        createRESTTool('roles_list', 'List roles', 'GET', '/api/roles'),
        createRESTTool('roles_create', 'Create role', 'POST', '/api/roles'),
        createRESTTool('roles_update', 'Update role', 'PUT', '/api/roles'),
        createRESTTool('roles_delete', 'Delete role', 'DELETE', '/api/roles'),
        createRESTTool('activity_recent', 'Recent activity', 'GET', '/api/activity/recent'),
        createRESTTool('performance_get', 'Get performance metrics', 'GET', '/api/performance'),
        createRESTTool('performance_post', 'Update performance metrics', 'POST', '/api/performance'),
        createRESTTool('hostpro_seat', 'HostPro seat', 'POST', '/api/hostpro/seat'),
        createRESTTool('hostpro_assign_table', 'HostPro assign table', 'POST', '/api/hostpro/assign-table'),
        createRESTTool('hostpro_assignments_get', 'HostPro assignments list', 'GET', '/api/hostpro/assignments'),
        createRESTTool('hostpro_assignments_post', 'HostPro create assignment', 'POST', '/api/hostpro/assignments'),
        createRESTTool('hostpro_domains_get', 'HostPro domains list', 'GET', '/api/hostpro/domains'),
        createRESTTool('hostpro_domains_post', 'HostPro upsert domain', 'POST', '/api/hostpro/domains'),
        createRESTTool('hostpro_session_get', 'HostPro get session', 'GET', '/api/hostpro/session'),
        createRESTTool('hostpro_session_post', 'HostPro create session', 'POST', '/api/hostpro/session'),
        createRESTTool('hostpro_session_put', 'HostPro update session', 'PUT', '/api/hostpro/session'),
        createRESTTool('hostpro_session_delete', 'HostPro delete session', 'DELETE', '/api/hostpro/session'),
        createRESTTool('hostpro_scan_layout_get', 'HostPro scan layout', 'GET', '/api/hostpro/scan-layout'),
        createRESTTool('hostpro_scan_layout_post', 'HostPro upload layout', 'POST', '/api/hostpro/scan-layout'),
        createRESTTool('hostpro_scan_layout_delete', 'HostPro delete layout', 'DELETE', '/api/hostpro/scan-layout'),
        createRESTTool('hostpro_process_floor_image_post', 'HostPro process floor image', 'POST', '/api/hostpro/process-floor-image'),
        createRESTTool('hostpro_process_floor_image_get', 'HostPro process floor image status', 'GET', '/api/hostpro/process-floor-image'),
        createRESTTool('hostpro_match_tables', 'HostPro match tables', 'POST', '/api/hostpro/match-tables'),
        createRESTTool('hostpro_presets_get', 'HostPro presets', 'GET', '/api/hostpro/presets'),
        createRESTTool('hostpro_domain_presets_get', 'HostPro domain presets', 'GET', '/api/hostpro/domain-presets'),
        createRESTTool('hostpro_domain_presets_post', 'HostPro set domain presets', 'POST', '/api/hostpro/domain-presets'),
        createRESTTool('shifts_active', '7shifts active shifts', 'GET', '/api/7shifts/active-shifts'),
        createRESTTool('shifts_department_overview', '7shifts department overview', 'GET', '/api/7shifts/department-overview'),
        createRESTTool('shifts_sync', '7shifts sync', 'POST', '/api/7shifts/sync'),
        createRESTTool('toast_auth_post', 'Toast auth login', 'POST', '/api/toast/auth'),
        createRESTTool('toast_auth_get', 'Toast auth status', 'GET', '/api/toast/auth'),
        createRESTTool('toast_auth_delete', 'Toast auth logout', 'DELETE', '/api/toast/auth'),
        createRESTTool('toast_employees', 'Toast employees list', 'GET', '/api/toast/employees'),
        createRESTTool('toast_employee_get', 'Toast employee by id', 'GET', '/api/toast/employees/[id]'),
        createRESTTool('toast_employee_put', 'Toast update employee', 'PUT', '/api/toast/employees/[id]'),
        createRESTTool('toast_employee_delete', 'Toast delete employee', 'DELETE', '/api/toast/employees/[id]'),
        createRESTTool('toast_employee_force_delete_post', 'Toast force delete employee', 'POST', '/api/toast/employees/[id]/delete'),
        createRESTTool('toast_employee_force_delete', 'Toast force delete employee (DELETE)', 'DELETE', '/api/toast/employees/[id]/delete'),
        createRESTTool('toast_employees_clear', 'Toast clear employees', 'POST', '/api/toast/employees/clear'),
        createRESTTool('toast_orders', 'Toast orders list', 'GET', '/api/toast/orders'),
        createRESTTool('toast_orders_post', 'Toast download orders', 'POST', '/api/toast/orders'),
        createRESTTool('toast_orders_bulk', 'Toast bulk orders', 'GET', '/api/toast/orders-bulk'),
        createRESTTool('toast_orders_metrics', 'Toast orders metrics', 'GET', '/api/toast/orders-metrics'),
        createRESTTool('toast_weekly_performance', 'Toast weekly performance', 'GET', '/api/toast/weekly-performance'),
        createRESTTool('toast_era_report_post', 'Toast ERA report', 'POST', '/api/toast/era-report'),
        createRESTTool('toast_era_report_get', 'Toast ERA report (GET)', 'GET', '/api/toast/era-report'),
        createRESTTool('toast_time_entries', 'Toast time entries', 'GET', '/api/toast/time-entries'),
        createRESTTool('toast_restaurant_id', 'Toast restaurant id', 'GET', '/api/toast/restaurant-id'),
        createRESTTool('toast_restaurants', 'Toast restaurants', 'GET', '/api/toast/restaurants'),
        createRESTTool('toast_menus', 'Toast menus', 'GET', '/api/toast/menus'),
        createRESTTool('toast_integration_status', 'Toast integration status', 'GET', '/api/toast/integration-status'),
        createRESTTool('toast_integration_summary', 'Toast integration summary', 'GET', '/api/toast/integration-summary'),
        createRESTTool('toast_analytics', 'Toast analytics', 'GET', '/api/toast/analytics'),
        createRESTTool('toast_debug', 'Toast debug', 'GET', '/api/toast/debug'),
        createRESTTool('toast_sync_get', 'Toast sync status', 'GET', '/api/toast/sync'),
        createRESTTool('toast_sync_post', 'Toast sync', 'POST', '/api/toast/sync'),
        createRESTTool('toast_webhooks_post', 'Toast webhook (POST)', 'POST', '/api/toast/webhooks'),
        createRESTTool('toast_webhooks_get', 'Toast webhook (GET)', 'GET', '/api/toast/webhooks'),
        createRESTTool('robots_list', 'Robots list', 'GET', '/api/robots'),
        createRESTTool('robot_get', 'Robot by id', 'GET', '/api/robots/[id]'),
        createRESTTool('robot_command', 'Send command to robot', 'POST', '/api/robots/[id]/command'),
        createRESTTool('robotic_fleets_calibration_get', 'Robotic fleets calibration GET', 'GET', '/api/robotic-fleets/calibration'),
        createRESTTool('robotic_fleets_calibration_post', 'Robotic fleets calibration POST', 'POST', '/api/robotic-fleets/calibration'),
        createRESTTool('facility_map', 'Facility map', 'GET', '/api/facility/map'),
        createRESTTool('workflows_get', 'Workflows list', 'GET', '/api/workflows'),
        createRESTTool('workflows_post', 'Create workflow', 'POST', '/api/workflows'),
        createRESTTool('auth_login', 'App login', 'POST', '/api/auth/login'),
        createRESTTool('auth_refresh', 'Refresh token', 'POST', '/api/auth/refresh'),
        createRESTTool('auth_logout', 'Logout', 'POST', '/api/auth/logout'),
        createRESTTool('auth_2fa_setup', '2FA setup', 'POST', '/api/auth/2fa/setup'),
        createRESTTool('auth_2fa_verify', '2FA verify', 'POST', '/api/auth/2fa/verify'),
        createRESTTool('auth_2fa_disable', '2FA disable', 'POST', '/api/auth/2fa/disable'),
        createRESTTool('auth_2fa_backup_codes_post', '2FA backup codes generate', 'POST', '/api/auth/2fa/backup-codes'),
        createRESTTool('auth_2fa_backup_codes_get', '2FA backup codes list', 'GET', '/api/auth/2fa/backup-codes'),
        createRESTTool('auth_change_password', 'Change password', 'POST', '/api/auth/change-password'),
        createRESTTool('varuni_sessions_get', 'Varuni sessions list', 'GET', '/api/varuni/sessions'),
        createRESTTool('varuni_sessions_post', 'Create Varuni session', 'POST', '/api/varuni/sessions'),
        createRESTTool('varuni_reindex', 'Varuni reindex', 'POST', '/api/varuni/reindex'),
        createRESTTool('identify_object', 'Identify object', 'POST', '/api/identify-object'),
        createRESTTool('sam_segmentation', 'SAM segmentation', 'POST', '/api/sam-segmentation'),
        createRESTTool('test_grpc_init', 'Test gRPC init', 'GET', '/api/test/grpc-init'),
        createRESTTool('test_explore', 'Test explore', 'GET', '/api/test/explore'),
        createRESTTool('test_auth', 'Test auth', 'GET', '/api/test/auth'),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ],
    });

    // 7shifts toolset (workforce scheduling)
    if (isOn('seven_shifts', true)) register({
      name: 'seven_shifts',
      description: '7shifts workforce and scheduling tools. Aggregates across all locations derived from server credentials. Primary source for live on-duty staff.',
      tools: [
        createRESTTool('seven_shifts_active', 'Return currently on-duty staff across all accessible locations; includes name, role, department, and local time range.', 'GET', '/api/7shifts/active-shifts'),
        createRESTTool('seven_shifts_department_overview', 'Department-level staffing overview across all locations with counts and active coverage.', 'GET', '/api/7shifts/department-overview'),
        createRESTTool('seven_shifts_sync', 'Run 7shifts sync to refresh roster mappings (use only when explicitly requested).', 'POST', '/api/7shifts/sync'),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ],
    });

    // Toast toolset (POS integrations)
    if (isOn('toast', true)) register({
      name: 'toast',
      description: 'Toast POS tools (auth, employees, orders, analytics). Useful fallback for staffing via POS clock-ins when 7shifts is unavailable.',
      tools: [
        createRESTTool('toast_auth_login', 'Toast auth login', 'POST', '/api/toast/auth'),
        createRESTTool('toast_auth_status', 'Toast auth status', 'GET', '/api/toast/auth'),
        createRESTTool('toast_auth_logout', 'Toast auth logout', 'DELETE', '/api/toast/auth'),
        createRESTTool('toast_employees_list', 'Toast employees list', 'GET', '/api/toast/employees'),
        createRESTTool('toast_employee_get', 'Toast employee by id', 'GET', '/api/toast/employees/[id]'),
        createRESTTool('toast_employee_update', 'Toast update employee', 'PUT', '/api/toast/employees/[id]'),
        createRESTTool('toast_employee_delete', 'Toast delete employee', 'DELETE', '/api/toast/employees/[id]'),
        createRESTTool('toast_employee_force_delete_post', 'Toast force delete employee', 'POST', '/api/toast/employees/[id]/delete'),
        createRESTTool('toast_employees_clear', 'Toast clear employees', 'POST', '/api/toast/employees/clear'),
        createRESTTool('toast_orders_list', 'Toast orders list', 'GET', '/api/toast/orders'),
        createRESTTool('toast_orders_download', 'Toast download orders', 'POST', '/api/toast/orders'),
        createRESTTool('toast_orders_bulk', 'Toast bulk orders', 'GET', '/api/toast/orders-bulk'),
        createRESTTool('toast_orders_metrics', 'Toast orders metrics', 'GET', '/api/toast/orders-metrics'),
        createRESTTool('toast_weekly_performance', 'Toast weekly performance', 'GET', '/api/toast/weekly-performance'),
        createRESTTool('toast_era_report_post', 'Toast ERA report', 'POST', '/api/toast/era-report'),
        createRESTTool('toast_era_report_get', 'Toast ERA report (GET)', 'GET', '/api/toast/era-report'),
        createRESTTool('toast_time_entries', 'Toast time entries (clock-ins). If dates are omitted, defaults to current business day in restaurant timezone; usable to approximate on-duty staff.', 'GET', '/api/toast/time-entries'),
        createRESTTool('toast_restaurant_id', 'Toast restaurant id', 'GET', '/api/toast/restaurant-id'),
        createRESTTool('toast_restaurants', 'Toast restaurants', 'GET', '/api/toast/restaurants'),
        createRESTTool('toast_menus', 'Toast menus', 'GET', '/api/toast/menus'),
        createRESTTool('toast_integration_status', 'Toast integration status', 'GET', '/api/toast/integration-status'),
        createRESTTool('toast_integration_summary', 'Toast integration summary', 'GET', '/api/toast/integration-summary'),
        createRESTTool('toast_analytics', 'Toast analytics', 'GET', '/api/toast/analytics'),
        createRESTTool('toast_debug', 'Toast debug', 'GET', '/api/toast/debug'),
        createRESTTool('toast_sync_get', 'Toast sync status', 'GET', '/api/toast/sync'),
        createRESTTool('toast_sync_post', 'Toast sync', 'POST', '/api/toast/sync'),
        createRESTTool('toast_webhooks_post', 'Toast webhook (POST)', 'POST', '/api/toast/webhooks'),
        createRESTTool('toast_webhooks_get', 'Toast webhook (GET)', 'GET', '/api/toast/webhooks'),
        { name: 'back_to_main', description: 'Return to main tools', handler: async () => ({ navigate: 'main' }) },
      ],
    });

    const callGraphQL = async (query: string, variables?: Record<string, any>) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({ query, variables }),
      });
      const json = await res.json();
      return json.data;
    };

    // REST caller helper using same auth
    const restOrigin = (() => {
      try { return new URL(endpoint).origin; } catch { return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'; }
    })();
    const callREST = async (path: string, method: string, options?: { query?: Record<string, any>; body?: any; headers?: Record<string, string> }) => {
      const isAbsolute = /^https?:\/\//i.test(path);
      const urlBase = isAbsolute ? '' : restOrigin;
      const urlPath = isAbsolute ? path : path;
      const qs = options?.query ? '?' + new URLSearchParams(Object.entries(options.query).reduce((acc: Record<string,string>, [k,v]) => { acc[k] = Array.isArray(v) ? v.join(',') : String(v); return acc; }, {})).toString() : '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        ...(options?.headers || {}),
      };
      const res = await fetch(urlBase + urlPath + qs, { method: method.toUpperCase(), headers, body: options?.body ? JSON.stringify(options.body) : undefined } as any);
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) throw new Error(typeof data === 'string' ? data : (data?.error || 'REST call failed'));
      return data;
    };

    // Build rich system prompt with time, user, and dashboard context
    // Resolve display name (prefer profile name from GraphQL; fallback to token fields; then email local part)
    const resolveCallerName = async (): Promise<string> => {
      try {
        const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': authHeader }, body: JSON.stringify({ query: 'query{ me{ name email } }' }) });
        const json = await resp.json();
        const name = (json && json.data && json.data.me && json.data.me.name) ? String(json.data.me.name) : '';
        const email = (json && json.data && json.data.me && json.data.me.email) ? String(json.data.me.email) : '';
        const src = (name && name.trim()) ? name : (userLabel || email || '');
        if (!src) return 'guest';
        if (src.includes('@')) return src.split('@')[0];
        return src.split(/\s+/)[0];
      } catch {
        const src = (userLabel || userId || '').toString();
        if (!src) return 'guest';
        if (src.includes('@')) return src.split('@')[0];
        return src.split(/\s+/)[0];
      }
    };
    const now = new Date();
    const who = await resolveCallerName();
    const day = now.toLocaleDateString(undefined, { weekday: 'long' });
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();
    // Minimal dashboard KPIs could be injected here in future
    const systemPromptOverride = `You are Varuni, an AI operations strategist.

Caller: ${who}
Day: ${day}
Date: ${date}
Time: ${time}

Context: You are assisting a restaurant backoffice operator inside ledger1. Prioritize accurate, actionable advice. When helpful, you may ground your guidance in the following industry references: The Cornell School of Hotel Administration on Hospitality, Restaurant Manager’s Handbook (Kotas), The Food Service Professional Guide series, and ServSafe standards. Use these as guiding standards—not to quote—when forming recommendations.

About ledger1:
ledger1 is a unified backoffice demo platform for hospitality operations.

Core Operating Principles (inherited from The Utility Company):
- Decentralized Ownership: Enable stakeholders to own, not just participate.
- Self-Reliance: Build systems where individuals and communities can create more than they consume.
- Transparency by Design: Every action should leave a verifiable digital trace, ensuring accountability and trust.
- East Meets West: Ground modern automation in timeless philosophies—efficiency paired with intentionality.
- Vertical Integration: Leverage shared infrastructure across all subsidiaries to enable a seamless and interoperable I3AS ecosystem.

Your Capabilities as Varuni:
- Offer short, actionable insights and concrete next steps grounded in live data where possible.
- Use specialized tools and systems for each module; when tools are available, prioritize their use over manual reasoning.
- Maintain operational harmony between tokenized ownership mechanics and real-world distillery workflows.
- Act as a strategic assistant to restaurant and hospitality operators managing ledger1-affiliated menus, products, and experiences.

Response rules:
- Be concise but sufficiently detailed. No meta narration (e.g., "I'm going to", "working on it").
- 1-3 sentences maximum, or a short bullet list of results.
- Never mention internal tools or toolsets. Do not instruct the user about navigation.
- Ask at most one clarifying question only when necessary.

System Behavior:
- Emphasize data-backed decisions, especially where inventory forecasting, token-based barrel planning, or invoice automation are concerned.

Data integration rules:
- Locations and service areas must come from provider data only. For staffing/on-duty queries, use 7shifts locations (company → all locationIds) and aggregate across all by default. Do not ask about or invent domain names like "distillery" or "tasting room" unless those exact labels exist in provider data.
- If the user omits location, assume all locations. Only ask a location question if the provider response requires a disambiguation you cannot resolve (e.g., multiple orgs with conflicting scopes).

Authoritative integrations:
- 7shifts [Seven Shifts] (workforce): Source of truth for live/on-duty staff, clock-ins, roles, departments, and staffing summaries. Prefer 7shifts for any roster/coverage questions and aggregate across all locations by default.
- Toast POS (sales/ops): Source of truth for orders, revenue, menu data, and POS-side labor where relevant. Prefer Toast for order analytics, menu visibility/stock, and employee directory when used.

Tool preferences:
- For live on-duty staff, call seven_shifts_active (all locations) and summarize by department/location if available. Do not use scheduling.* for this.
 - If seven_shifts_active returns an error or no items, fall back to POS clock-ins: call toast_restaurants to list connected restaurants, then toast_time_entries for the current business day per restaurant, and join with toast_employees_list for names and roles. Aggregate across all restaurants and clearly note that this is a POS approximation.

Navigation rules:
- You have toolsets (grouped tool dictionaries). Start in the main navigator.
- To see groups, call list_toolsets. To see tools in a group, call list_tools with the toolset name.
- To switch groups, call open_toolset or a specific open_* tool (e.g., open_seven_shifts, open_toast).
- After completing a task, call back_to_main to return to the navigator so future turns stay organized.

Credential rules:
- Never ask the user for 7shifts company/org name or identifiers; derive org and locations from the configured API token.
- Never ask the user for Toast restaurant GUID; retrieve it via the toast_restaurant_id endpoint and cache per session if needed.

Voice & Tone:
- Be concise, confident, and instructive.
- Respect the user’s time—focus on what to do next.
- Honor the legacy of Varuni: maintain order, ensure prosperity, and enable fluid operations.

Daily framing: Always relate insights to day-part and current business date when relevant (e.g., pre-service, mid-service, close). If the user’s request could change by time horizon (today vs tomorrow), state assumptions explicitly.

Operating rules: Ask concise clarifying questions before tool calls when ambiguity exists. Keep tool chatter internal in the sense that I don't want you to announce the tools you used or the tool sets you are navigating between. After tools finish, produce ONE concise markdown response with: key numbers, assumptions, and 1–3 next steps.`;

    // Pull limited history from existing session (if provided)
    let history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    if (sessionId) {
      try {
        const existing = await ChatSession.findById(sessionId);
        if (existing && Array.isArray(existing.messages)) {
          const last = existing.messages.slice(-10); // last 10 messages
          history = last.map(m => ({ role: m.role as any, content: m.content }));
        }
      } catch {}
    }

    const useLangGraph = (process.env.VARUNI_LANGGRAPH_ENABLED === 'true');
    const runtimeOpts = {
      hitl: process.env.VARUNI_HITL_ENABLED === 'true',
      parallelReads: process.env.VARUNI_PARALLEL_READS !== 'false',
      ...(runtime || {}),
    } as any;
    const result = useLangGraph
      ? await runVaruniLangGraph({
          prompt: String(message || ''),
          context: { graphqlEndpoint: endpoint, callGraphQL, accessToken: (authHeader.split(' ')[1] || undefined), restBaseUrl: restOrigin, callREST, systemPromptOverride },
          activeToolset: activeToolset,
          history,
          getToolsets: () => toolsets,
          sessionId,
          runtime: runtimeOpts,
        })
      : await agent.chat(String(message || ''), {
      graphqlEndpoint: endpoint,
      callGraphQL,
          accessToken: (authHeader.split(' ')[1] || undefined),
          restBaseUrl: restOrigin,
          callREST,
      systemPromptOverride,
        }, activeToolset, {
          onEvent: (evt) => {
            try {
              const chan = sessionId ? `chat:${sessionId}` : undefined;
              if (chan) sseBus.publish(chan, { ...evt, turnId: turnId || null });
            } catch {}
          },
          history,
          requireApproval: !!runtimeOpts.hitl && runtimeOpts.decision !== 'APPROVE',
          parallelizeReads: !!runtimeOpts.parallelReads,
        });

    // Ensure non-empty minimal reply and sanitize meta/tool logs
    const sanitize = (t: string) => {
      try {
        const lines = String(t || '').split(/\r?\n/);
        const kept = lines.filter((ln) => {
          const s = ln.trim();
          if (!s) return true;
          if (/^Tools:/i.test(s)) return false;
          if (/^to=functions\./i.test(s)) return false;
          if (/^\{.*\}$/i.test(s)) return false;
          if (/^Calling\s+/i.test(s)) return false;
          if (/^Proceeding\s+/i.test(s)) return false;
          if (/^Initiating\s+/i.test(s)) return false;
          if (/^Done\.?$/i.test(s)) return false;
          return true;
        });
        // collapse multiple blank lines
        return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      } catch { return t; }
    };
    let safeText = (typeof result.text === 'string' ? sanitize(result.text) : '').trim();
    if (!safeText) {
      // Fall back to a concise error/explanation if tools were used but produced no message
      const hadTools = Array.isArray(result.usedTools) && result.usedTools.length > 0;
      if (hadTools) {
        const failures = (result.usedTools as any[]).filter(t => t && t.result && t.result.success === false);
        if (failures.length) {
          const msgs = failures.map(f => `${f.name}: ${f.result.error || 'failed'}`);
          safeText = `I couldn't complete the request due to tool errors: ${msgs.join('; ')}. Please retry or adjust the request.`;
        }
      }
      if (!safeText) safeText = 'Done.';
    }
    // Ensure markdown support
    const html = await marked.parse(safeText);
    // Persist session
    let session;
    if (sessionId) {
      session = await ChatSession.findById(sessionId);
    }
    if (!session) {
      session = await ChatSession.create({ userId, title: String(message || 'Conversation'), messages: [] });
    }
    session.messages.push({ role: 'user', content: String(message || '') });
    session.messages.push({ role: 'assistant', content: safeText, html });
    try {
      // Publish final to SSE channel so UI can stop streaming and avoid double append
      const chan = `chat:${String(session._id)}`;
      const event = { type: 'final', message: safeText, html, turnId: (typeof (runtime||{}).turnId === 'string' ? (runtime as any).turnId : null) } as any;
      ;(await import('@/lib/services/sse-bus')).default.publish(chan, event);
    } catch {}
    // Track token usage if available; otherwise estimate from assistant reply
    try {
      const tokenHeader = (result as any)?.usage?.total_tokens || undefined;
      if (typeof tokenHeader === 'number') {
        session.tokenTotal = (session.tokenTotal || 0) + Number(tokenHeader || 0);
      } else {
        const approx = Math.ceil((safeText || '').length / 4);
        session.tokenTotal = (session.tokenTotal || 0) + approx;
      }
    } catch {}
    // Compute approximate context tokens for UI display
    const contextTokens = (() => {
      try { return (session.messages || []).reduce((acc, m) => acc + Math.ceil(String(m.content || '').length / 4), 0); } catch { return 0; }
    })();
    await session.save();

    return NextResponse.json({ success: true, sessionId: String(session._id), ...result, text: safeText, html, tokenTotal: session.tokenTotal, contextTokens }, { status: 200 });
  } catch (err: any) {
    console.error('Varuni chat error', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

export const GET = async () => new NextResponse('Method Not Allowed', { status: 405 });

