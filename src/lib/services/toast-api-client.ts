import ToastAuthService from './toast-auth';
import ToastErrorHandler from './toast-error-handler';
import { isDemoMode, isDemoStubsEnabled } from '@/lib/config/demo';
import { z } from 'zod';

// Toast API data schemas
export const ToastEmployeeSchema = z.object({
  guid: z.string(),
  entityType: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().optional(),
  jobTitles: z.array(z.object({
    guid: z.string(),
    title: z.string(),
    tip: z.boolean(),
    hourlyRate: z.number().optional(),
  })).optional(),
  externalId: z.string().optional(),
  createdDate: z.string(),
  modifiedDate: z.string(),
  deletedDate: z.string().optional(),
});

export const ToastOrderSchema = z.object({
  guid: z.string(),
  entityType: z.string(),
  businessDate: z.number(),
  diningOption: z.object({
    guid: z.string(),
    curbside: z.boolean().optional(),
    delivery: z.boolean().optional(),
    dineIn: z.boolean().optional(),
    takeOut: z.boolean().optional(),
  }),
  checks: z.array(z.object({
    guid: z.string(),
    displayNumber: z.string(),
    openedDate: z.string(),
    closedDate: z.string().optional(),
    deletedDate: z.string().optional(),
    selections: z.array(z.any()).optional(),
    customer: z.object({
      guid: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    }).optional(),
  })),
  createdDate: z.string(),
  modifiedDate: z.string(),
});

export const ToastMenuSchema = z.object({
  guid: z.string(),
  entityType: z.string(),
  name: z.string(),
  description: z.string().optional(),
  groups: z.array(z.object({
    guid: z.string(),
    name: z.string(),
    items: z.array(z.object({
      guid: z.string(),
      name: z.string(),
      description: z.string().optional(),
      price: z.number(),
      calories: z.number().optional(),
      visibility: z.string(),
    })),
  })),
  createdDate: z.string(),
  modifiedDate: z.string(),
});

export const ToastRestaurantSchema = z.object({
  guid: z.string(),
  entityType: z.string(),
  restaurantName: z.string(),
  locationName: z.string(),
  address: z.object({
    address1: z.string(),
    address2: z.string().optional(),
    city: z.string(),
    stateCode: z.string(),
    zipCode: z.string(),
    country: z.string(),
  }),
  phoneNumber: z.string().optional(),
  emailAddress: z.string().optional(),
  website: z.string().optional(),
  timeZone: z.string(),
  createdDate: z.string(),
  modifiedDate: z.string(),
});

export type ToastEmployee = z.infer<typeof ToastEmployeeSchema>;
export type ToastOrder = z.infer<typeof ToastOrderSchema>;
export type ToastMenu = z.infer<typeof ToastMenuSchema>;
export type ToastRestaurant = z.infer<typeof ToastRestaurantSchema>;

export interface ToastAPIResponse<T> {
  data: T[];
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

export class ToastAPIClient {
  private authService: ToastAuthService;

  constructor() {
    this.authService = ToastAuthService.getInstance();
  }

  /**
   * Make authenticated API request
   */
  public async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: string,
    queryParams?: Record<string, string>,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    try {
      if (isDemoMode() && isDemoStubsEnabled()) {
        // Return minimal plausible shapes for common Toast endpoints
        const path = String(endpoint || '').toLowerCase();
        const nowIso = new Date().toISOString();
        if (path.includes('/menus')) {
          return { menus: [{ name: 'Demo Menu', menuGroups: [{ name: 'Entrees', menuItems: [{ guid: 'demo-item-1', name: 'Margherita Pizza', description: 'Fresh basil, tomatoes, mozzarella', pricing: { basePrice: 12.0 }, disabled: false }] }] }] } as any as T;
        }
        if (path.includes('/orders')) {
          return [
            { guid: 'ord1', orderNumber: '1001', totalAmount: 48.5, orderStatus: 'PAID', createdDate: nowIso, selections: [{ item: { name: 'Margherita Pizza' }, quantity: 2, price: 24.5 }] },
          ] as any as T;
        }
        if (path.includes('/labor') || path.includes('/timeentries')) {
          return [{ id: 'te1', employeeId: 'tm2', clockIn: nowIso }] as any as T;
        }
        if (path.includes('/stock')) {
          return [{ sku: 'SYS-1001', quantity: 25, status: 'LOW' }] as any as T;
        }
        return {} as T;
      }
      const baseHeaders = await this.authService.getAuthHeaders();
      const headers = { ...baseHeaders, ...extraHeaders };
      
      let url = `${process.env.TOAST_API_HOSTNAME}${endpoint}`;
      
      // Add query parameters
      if (queryParams) {
        const searchParams = new URLSearchParams(queryParams);
        url += `?${searchParams.toString()}`;
      }

      console.log(`Making Toast API request: ${method} ${url}`);
      console.log('Headers:', { ...headers, Authorization: headers.Authorization ? `${headers.Authorization.substring(0, 20)}...` : 'None' });
      if (body) {
        console.log('Body:', body);
      }

      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body, // body is already a string, so no need to stringify
      });

      console.log(`Toast API response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Toast API Error Response: ${errorText}`);
        throw new Error(`Toast API request failed: ${response.status} - ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return {} as T;
      }
    } catch (error) {
      const errorHandler = ToastErrorHandler.getInstance();
      const toastError = errorHandler.handleError(error, endpoint, false); // Don't show toast on server
      throw new Error(toastError.message);
    }
  }

  // Employee Management APIs
  
  /**
   * Get all employees for a restaurant
   */
  public async getEmployees(restaurantGuid: string, page = 1, pageSize = 100): Promise<ToastAPIResponse<ToastEmployee>> {
    // Prefer v2 if available, fallback to v1
    const endpoints = [
      `/labor/v2/employees`,
      `/labor/v1/employees`,
    ];
    
    // Toast API - remove employeeIds to get all employees, or pagination might not be supported
    const queryParams: Record<string, string> = {};
    
    // Only add pagination if supported
    // queryParams.page = page.toString();
    // queryParams.pageSize = pageSize.toString();

    // Employee API requires special header - exact format from Toast docs
    const headers = {
      'Toast-Restaurant-External-ID': restaurantGuid, // Note: Capital ID at the end!
    };

    console.log(`🔍 Employee API call with Toast-Restaurant-External-ID header: ${restaurantGuid}`);

    try {
      // First try v2 then v1
      let response: unknown;
      let lastError: unknown = null;
      for (const ep of endpoints) {
        try {
          response = await this.makeRequest<unknown>(ep, 'GET', undefined, queryParams, headers);
          break;
        } catch (err) {
          lastError = err;
          continue;
        }
      }
      if (!response) throw lastError || new Error('Toast employees request failed');
        
      // Log response for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ SUCCESS with employee endpoint:`, JSON.stringify(response, null, 2));
      }
      
      // Validate and transform response
      const allEmployees = Array.isArray(response) ? response : (response as {data?: unknown[]}).data || [];
      
      // Filter for ACTIVE employees only (no deletedDate or epoch date)
      const activeEmployees = allEmployees.filter((emp: { deletedDate: string | null; }) => {
        const deletedDate = emp.deletedDate;
        return !deletedDate || 
               deletedDate === null || 
               deletedDate === "1970-01-01T00:00:00.000+0000" ||
               deletedDate.includes("1970-01-01");
      });
      
      console.log(`📊 Total employees from Toast: ${allEmployees.length}, Active: ${activeEmployees.length}`);
      
      // Use flexible schema for employees (v2 adds deleted/archived/jobReferences)
      const flexibleEmployeeSchema = z.object({
        guid: z.string(),
        entityType: z.string().optional(),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().email().optional().nullable(),
        jobTitles: z.array(z.object({
          guid: z.string(),
          title: z.string(),
          tip: z.boolean(),
          hourlyRate: z.number().optional(),
        })).optional(),
        jobReferences: z.array(z.object({
          guid: z.string().optional(),
          jobTitleGuid: z.string().optional(),
          jobTitleName: z.string().optional(),
          title: z.string().optional(),
        })).optional(),
        externalId: z.string().optional().nullable(),
        createdDate: z.union([z.string(), z.number()]).optional(),
        modifiedDate: z.union([z.string(), z.number()]).optional(),
        deletedDate: z.union([z.string(), z.number()]).optional().nullable(),
        // Additional fields that might be present
        employeeId: z.string().optional(),
        status: z.string().optional(),
        deleted: z.boolean().optional(),
        archived: z.boolean().optional(),
      }).transform((data) => {
        // Prefer roles from jobReferences if provided
        const normalizedJobTitles = (data.jobReferences && data.jobReferences.length > 0)
          ? data.jobReferences.map((r: { jobTitleGuid?: string; guid?: string; jobTitleName?: string; title?: string; }) => ({
              guid: r.jobTitleGuid || r.guid || 'unknown',
              title: r.jobTitleName || r.title || '',
              tip: false,
            }))
          : (data.jobTitles || []);
        // If titles came back empty strings, fallback to config endpoint for mapping
        (normalizedJobTitles as {title: string}[]).some((jt) => !jt.title);
        // Note: cannot call async inside transform; mapping will be enhanced post-parse below

        const archivedOrDeleted = data.deleted === true || data.archived === true;
        const computedDeletedDate = archivedOrDeleted
          ? new Date().toISOString()
          : (data.deletedDate ? (typeof data.deletedDate === 'number' ? new Date(data.deletedDate).toISOString() : data.deletedDate) : undefined);
        return {
          guid: data.guid,
          entityType: data.entityType || 'Employee',
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || undefined,
          jobTitles: normalizedJobTitles,
          externalId: data.externalId || undefined,
          createdDate: typeof data.createdDate === 'number' ? new Date(data.createdDate).toISOString() : 
                      data.createdDate || new Date().toISOString(),
          modifiedDate: typeof data.modifiedDate === 'number' ? new Date(data.modifiedDate).toISOString() : 
                       data.modifiedDate || new Date().toISOString(),
          deletedDate: computedDeletedDate,
          // Pass through flags for downstream logic
          deletedFlag: data.deleted === true,
          archivedFlag: data.archived === true,
          status: data.status || undefined,
        };
      });
      
      let validatedEmployeesRaw = activeEmployees.map((emp) => flexibleEmployeeSchema.parse(emp));

      // Post-parse enhancement: fill missing job titles via config map
      const needsRoleMap = validatedEmployeesRaw.some((e) => (e.jobTitles || []).some((jt) => !jt.title));
      if (needsRoleMap) {
        try {
          const rolesMap = await this.getJobTitlesMap(restaurantGuid);
          validatedEmployeesRaw = validatedEmployeesRaw.map((e) => ({
            ...e,
            jobTitles: (e.jobTitles || []).map((jt) => ({
              ...jt,
              title: jt.title || rolesMap[jt.guid] || 'Employee',
            })),
          }));
        } catch { /* empty */ }
      }

      // Exclude archived/deleted again post-normalization just in case
      const validatedEmployees = validatedEmployeesRaw.filter((emp) => {
        const dd = emp.deletedDate;
        return !dd || (typeof dd === 'string' && dd.includes('1970-01-01'));
      });

      console.log(`Found ${validatedEmployees.length} employees from Toast API`);

      return {
        data: validatedEmployees,
        page,
        pageSize,
        hasMore: validatedEmployees.length === pageSize,
      };
      
    } catch (error: unknown) {
      // If it fails with restaurant-external-id error, try other approaches
      if (error instanceof Error && error.message && error.message.includes('restaurant-external-id')) {
        console.log(`❌ Failed with restaurant-external-id header. Trying alternate approaches...`);
        
        // Try with different approaches based on Toast docs
        const alternativeHeaders: Record<string, string | undefined>[] = [
          { 'Toast-Restaurant-External-ID': restaurantGuid }, // Exact format
          { 'restaurant-external-id': restaurantGuid as unknown as string },
          {}, // Try without the header
        ];
        
        for (const altHeaders of alternativeHeaders) {
          try {
            console.log(`🔄 Trying alternative headers:`, altHeaders);
            const cleanHeaders = Object.fromEntries(Object.entries(altHeaders).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
            const response = await this.makeRequest<unknown>(endpoints[0], 'GET', undefined, queryParams, cleanHeaders);
            
            // If successful, process the response the same way
            const allEmployees = Array.isArray(response) ? response : (response as {data?: unknown[]}).data || [];
            const activeEmployees = allEmployees.filter((emp: { deletedDate: string | null; }) => {
              const deletedDate = emp.deletedDate;
              return !deletedDate || 
                     deletedDate === null || 
                     deletedDate === "1970-01-01T00:00:00.000+0000" ||
                     deletedDate.includes("1970-01-01");
            });
            // Basic normalization without schema (fallback path)
            const validatedEmployees = activeEmployees
              .map((emp: { guid: string; entityType: string; firstName: string; lastName: string; email: string; jobReferences: unknown[]; jobTitles: unknown[]; externalId: string; createdDate: string; modifiedDate: string; deleted: boolean; archived: boolean; deletedDate: string; }) => ({
                guid: emp.guid,
                entityType: emp.entityType || 'Employee',
                firstName: emp.firstName,
                lastName: emp.lastName,
                email: emp.email || undefined,
                jobTitles: (emp.jobReferences || emp.jobTitles || []).map((r: unknown) => ({
                  guid: (r as { jobTitleGuid?: string; guid?: string }).jobTitleGuid || (r as { jobTitleGuid?: string; guid?: string }).guid || 'unknown',
                  title: (r as { jobTitleName?: string; title?: string }).jobTitleName || (r as { jobTitleName?: string; title?: string }).title || 'Employee',
                  tip: false,
                })),
                externalId: emp.externalId || undefined,
                createdDate: emp.createdDate,
                modifiedDate: emp.modifiedDate,
                deletedDate: emp.deleted === true || emp.archived === true ? new Date().toISOString() : emp.deletedDate,
              }))
              .filter((emp: { deletedDate: string; }) => !emp.deletedDate || (typeof emp.deletedDate === 'string' && emp.deletedDate.includes('1970-01-01')));
            
            console.log(`✅ Found ${validatedEmployees.length} employees with alternative header approach`);
            
            return {
              data: validatedEmployees,
              page,
              pageSize,
              hasMore: validatedEmployees.length === pageSize,
            };
          } catch (altError) {
            console.log(`❌ Alternative approach failed:`, altError instanceof Error ? altError.message : altError);
            continue;
          }
        }
      }
      
      const errorHandler = ToastErrorHandler.getInstance();
      const toastError = errorHandler.handleError(error, endpoints[0], false); // Don't show toast on server
      throw new Error(toastError.message);
    }
  }

  /**
   * Get a specific employee by GUID
   */
  public async getEmployee(restaurantGuid: string, employeeGuid: string): Promise<ToastEmployee> {
    const endpoint = `/labor/v1/employees/${employeeGuid}`;
    const queryParams = { restaurantGuid };

    const response = await this.makeRequest<unknown>(endpoint, 'GET', undefined, queryParams);
    return ToastEmployeeSchema.parse(response);
  }

  /**
   * Create a new employee
   */
  public async createEmployee(restaurantGuid: string, employeeData: Partial<ToastEmployee>): Promise<ToastEmployee> {
    const endpoint = `/labor/v1/employees`;
    const queryParams = { restaurantGuid };

    const response = await this.makeRequest<unknown>(endpoint, 'POST', JSON.stringify(employeeData), queryParams);
    return ToastEmployeeSchema.parse(response);
  }

  /**
   * Update an existing employee
   */
  public async updateEmployee(restaurantGuid: string, employeeGuid: string, employeeData: Partial<ToastEmployee>): Promise<ToastEmployee> {
    const endpoint = `/labor/v1/employees/${employeeGuid}`;
    const queryParams = { restaurantGuid };

    const response = await this.makeRequest<unknown>(endpoint, 'PUT', JSON.stringify(employeeData), queryParams);
    return ToastEmployeeSchema.parse(response);
  }

  // Order Management APIs

  /**
   * Get job titles/config mapping (jobTitleGuid -> name) for a restaurant
   */
  public async getJobTitlesMap(restaurantGuid: string): Promise<Record<string, string>> {
    // Per Toast docs, jobs are available under Labor v1: /labor/v1/jobs
    // https://doc.toasttab.com/openapi/labor/operation/jobsGet/
    const headers = { 'Toast-Restaurant-External-ID': restaurantGuid };
    const response = await this.makeRequest<unknown>(`/labor/v1/jobs`, 'GET', undefined, undefined, headers);
    const items = Array.isArray(response) ? response : (response as {data?: unknown[]})?.data || [];
    const map: Record<string, string> = {};
    for (const item of (items as { guid?: string; jobTitleGuid?: string; id?: string; title?: string; name?: string; jobTitleName?: string; }[])) {
      const guid = item.guid || item.jobTitleGuid || item.id;
      const name = item.title || item.name || item.jobTitleName;
      if (guid && name) map[guid] = name;
    }
    return map;
  }

  /**
   * Get orders for a specific date range
   */
  public async getOrders(
    restaurantGuid: string,
    startDate: string,
    endDate: string,
    page = 1,
    pageSize = 100
  ): Promise<ToastAPIResponse<ToastOrder>> {
    const endpoint = `/orders/v2/orders`;
    const queryParams = {
      restaurantGuid,
      startDate,
      endDate,
      page: page.toString(),
      pageSize: pageSize.toString(),
    };

    // Add required header for Toast API
    const headers = {
      'Toast-Restaurant-External-ID': restaurantGuid,
    };

    const response = await this.makeRequest<unknown>(endpoint, 'GET', undefined, queryParams, headers);
    
    const orders = Array.isArray(response) ? response : (response as {data?: unknown[]}).data || [];
    const validatedOrders = orders.map((order) => ToastOrderSchema.parse(order));

    return {
      data: validatedOrders,
      page,
      pageSize,
      hasMore: validatedOrders.length === pageSize,
    };
  }

  /**
   * Get a specific order by GUID
   */
  public async getOrder(restaurantGuid: string, orderGuid: string): Promise<ToastOrder> {
    const endpoint = `/orders/v2/orders/${orderGuid}`;
    const queryParams = { restaurantGuid };

    const response = await this.makeRequest<unknown>(endpoint, 'GET', undefined, queryParams);
    return ToastOrderSchema.parse(response);
  }

  // Menu Management APIs

  /**
   * Get menu information
   */
  public async getMenus(restaurantGuid: string): Promise<ToastAPIResponse<ToastMenu>> {
    const endpoint = `/menus/v2/menus`;
    const queryParams = { restaurantGuid };

    const response = await this.makeRequest<unknown>(endpoint, 'GET', undefined, queryParams);
    
    const menus = Array.isArray(response) ? response : (response as {data?: unknown[]}).data || [];
    const validatedMenus = menus.map((menu) => ToastMenuSchema.parse(menu));

    return {
      data: validatedMenus,
    };
  }

  // Restaurant Information APIs

  /**
   * Get restaurant information
   */
  public async getRestaurant(restaurantGuid: string): Promise<ToastRestaurant> {
    const endpoint = `/restaurants/v1/restaurants/${restaurantGuid}`;
    // Some tenants require the restaurant external id header even for this endpoint
    const headers = {
      'Toast-Restaurant-External-ID': restaurantGuid,
    } as Record<string, string>;
    const response = await this.makeRequest<unknown>(endpoint, 'GET', undefined, undefined, headers);
    
    // Log response for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Toast Restaurant Response:', JSON.stringify(response, null, 2));
    }
    
    // Use flexible validation
    const flexibleRestaurantSchema = z.object({
      guid: z.string().optional(),
      restaurantGuid: z.string().optional(),
      id: z.string().optional(),
      entityType: z.string().optional(),
      restaurantName: z.string().optional(),
      locationName: z.string().optional(),
      name: z.string().optional(),
      address: z.object({
        address1: z.string().optional(),
        address2: z.string().optional(),
        city: z.string().optional(),
        stateCode: z.string().optional(),
        zipCode: z.string().optional(),
        country: z.string().optional(),
      }).optional(),
      phoneNumber: z.string().optional(),
      emailAddress: z.string().optional(),
      website: z.string().optional(),
      timeZone: z.string().optional(),
      createdDate: z.union([z.string(), z.number()]).optional(),
      modifiedDate: z.union([z.string(), z.number()]).optional(),
      isoCreatedDate: z.string().optional(),
      isoModifiedDate: z.string().optional(),
    }).transform((data) => {
      const address = data.address || {};
      return {
        guid: data.guid || data.restaurantGuid || data.id || restaurantGuid,
        entityType: data.entityType || 'Restaurant',
        restaurantName: data.restaurantName || data.name || 'Unknown Restaurant',
        locationName: data.locationName || data.name || 'Unknown Location',
        address: {
          address1: (address as { address1?: string }).address1 || '',
          address2: (address as { address2?: string }).address2 || undefined,
          city: (address as { city?: string }).city || '',
          stateCode: (address as { stateCode?: string }).stateCode || '',
          zipCode: (address as { zipCode?: string }).zipCode || '',
          country: (address as { country?: string }).country || 'US',
        },
        phoneNumber: data.phoneNumber || '',
        emailAddress: data.emailAddress || '',
        website: data.website || '',
        timeZone: data.timeZone || (process.env.TOAST_TIMEZONE || 'America/Denver'),
        createdDate: data.isoCreatedDate || 
                    (typeof data.createdDate === 'number' ? new Date(data.createdDate).toISOString() : 
                     data.createdDate) || new Date().toISOString(),
        modifiedDate: data.isoModifiedDate || 
                     (typeof data.modifiedDate === 'number' ? new Date(data.modifiedDate).toISOString() : 
                      data.modifiedDate) || new Date().toISOString(),
      };
    });
    
    return flexibleRestaurantSchema.parse(response);
  }

  /**
   * Get all connected restaurants
   */
  public async getConnectedRestaurants(): Promise<ToastAPIResponse<ToastRestaurant>> {
    const endpoint = `/partners/v1/restaurants`;

    const response = await this.makeRequest<unknown>(endpoint, 'GET');
    
    // Log response for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Toast Restaurants Response:', JSON.stringify(response, null, 2));
    }
    
    const restaurants = Array.isArray(response) ? response : (response as { data?: unknown[] }).data || [];
    
    // Use a more flexible schema for restaurant validation
    const flexibleRestaurantSchema = z.object({
      guid: z.string().optional(),
      restaurantGuid: z.string().optional(),
      id: z.string().optional(),
      entityType: z.string().optional(),
      restaurantName: z.string().optional(),
      locationName: z.string().optional(),
      name: z.string().optional(),
      address: z.object({
        address1: z.string().optional(),
        address2: z.string().optional(),
        city: z.string().optional(),
        stateCode: z.string().optional(),
        zipCode: z.string().optional(),
        country: z.string().optional(),
      }).optional(),
      phoneNumber: z.string().optional(),
      emailAddress: z.string().optional(),
      website: z.string().optional(),
      timeZone: z.string().optional(),
      createdDate: z.union([z.string(), z.number()]).optional(),
      modifiedDate: z.union([z.string(), z.number()]).optional(),
      // Additional fields that might be present
      managementGroupGuid: z.string().optional(),
      isArchived: z.boolean().optional(),
      deleted: z.boolean().optional(),
      createdByEmailAddress: z.string().optional(),
      externalGroupRef: z.string().optional().nullable(),
      externalRestaurantRef: z.string().optional().nullable(),
      isoCreatedDate: z.string().optional(),
      isoModifiedDate: z.string().optional(),
    }).transform((data) => {
      // Normalize restaurant data
      const address = data.address || { address1: '', city: '', stateCode: '', zipCode: '', country: 'US' };
      return {
        guid: data.guid || data.restaurantGuid || data.id || 'unknown',
        entityType: data.entityType || 'Restaurant',
        restaurantName: data.restaurantName || data.name || 'Unknown Restaurant',
        locationName: data.locationName || data.name || 'Unknown Location',
        address: {
          address1: address.address1 || '',
          address2: address.address2,
          city: address.city || '',
          stateCode: address.stateCode || '',
          zipCode: address.zipCode || '',
          country: address.country || 'US',
        },
        phoneNumber: data.phoneNumber || '',
        emailAddress: data.emailAddress || '',
        website: data.website || '',
        timeZone: data.timeZone || (process.env.TOAST_TIMEZONE || 'America/Denver'),
        createdDate: data.isoCreatedDate || 
                    (typeof data.createdDate === 'number' ? new Date(data.createdDate).toISOString() : 
                     data.createdDate) || new Date().toISOString(),
        modifiedDate: data.isoModifiedDate || 
                     (typeof data.modifiedDate === 'number' ? new Date(data.modifiedDate).toISOString() : 
                      data.modifiedDate) || new Date().toISOString(),
      };
    });
    
    const validatedRestaurants = restaurants.map((restaurant: unknown) => flexibleRestaurantSchema.parse(restaurant));

    return {
      data: validatedRestaurants as ToastRestaurant[],
    };
  }

  async listRestaurants(): Promise<any[]> {
    return this.makeRequest<any[]>('/partners/v1/restaurants', 'GET');
  }

  // Analytics APIs

  /**
   * Get sales summary for a date range
   */
  public async getSalesSummary(
    restaurantGuid: string,
    businessDate: string
  ): Promise<unknown> {
    const endpoint = `/reports/v1/reports/salesSummary`;
    const queryParams = {
      restaurantGuid,
      businessDate,
    };

    return await this.makeRequest<unknown>(endpoint, 'GET', undefined, queryParams);
  }

  /**
   * Get labor summary for a date range
   */
  public async getLaborSummary(
    restaurantGuid: string,
    businessDate: string
  ): Promise<unknown> {
    const endpoint = `/reports/v1/reports/laborSummary`;
    const queryParams = {
      restaurantGuid,
      businessDate,
    };

    return await this.makeRequest<unknown>(endpoint, 'GET', undefined, queryParams);
  }

  /**
   * Get time entries for employees
   */
  public async getTimeEntries(
    restaurantGuid: string,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const endpoint = `/labor/v1/timeEntries`;
    const queryParams = {
      startDate,
      endDate,
    };
    const headers = {
      'Toast-Restaurant-External-ID': restaurantGuid,
    };

    return await this.makeRequest<any[]>(endpoint, 'GET', undefined, queryParams, headers);
  }

  async requestEraReport(restaurantGuid: string, startDate: string, endDate: string): Promise<string> {
    const response = await this.makeRequest<{ reportRequestGuid: string }>(
      '/era/v1/metrics/time-series',
      'POST',
      JSON.stringify({
        startBusinessDate: startDate,
        endBusinessDate: endDate,
        restaurantIds: [restaurantGuid],
        groupBy: ['REVENUE_CENTER'],
      })
    );
    return response.reportRequestGuid;
  }

  async getEraReport<T>(reportRequestGuid: string): Promise<T> {
    return this.makeRequest<T>(`/era/v1/metrics/${reportRequestGuid}`);
  }

  // Utility Methods

  /**
   * Test API connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.getConnectedRestaurants();
      return true;
    } catch {
      console.error('Toast API connection test failed:');
      return false;
    }
  }

  /**
   * Get API health status
   */
  public async getHealthStatus(): Promise<{ status: string; timestamp: string }> {
    try {
      await this.getConnectedRestaurants();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Stock/Inventory status for Menu Items (86ing)

  /**
   * Fetch inventory status for a list of menu item GUIDs or multi-location IDs
   */
  public async getMenuItemInventory(
    restaurantGuid: string,
    guids: string[] = [],
    multiLocationIds: string[] = []
  ): Promise<Array<{ guid?: string; multiLocationId?: string; status?: string; quantity?: number | null; versionId?: string }>> {
    const headers = {
      'Toast-Restaurant-External-ID': restaurantGuid,
      'Content-Type': 'application/json',
    } as Record<string, string>;
    const body = JSON.stringify({
      ...(Array.isArray(guids) && guids.length ? { guids } : {}),
      ...(Array.isArray(multiLocationIds) && multiLocationIds.length ? { multiLocationIds } : {}),
    });
    const resp = await this.makeRequest<any>(
      '/stock/v1/inventory/search',
      'POST',
      body,
      undefined,
      headers
    );
    const arr = Array.isArray(resp) ? resp : (resp?.data || []);
    return arr as any[];
  }

  /**
   * Update inventory status for menu items (e.g., set OUT_OF_STOCK)
   */
  public async updateMenuItemInventory(
    restaurantGuid: string,
    updates: Array<{ guid?: string; multiLocationId?: string; status: 'IN_STOCK' | 'OUT_OF_STOCK' | 'QUANTITY'; quantity?: number | null; versionId?: string }>
  ): Promise<Array<{ guid?: string; multiLocationId?: string; status?: string; quantity?: number | null; versionId?: string }>> {
    const headers = {
      'Toast-Restaurant-External-ID': restaurantGuid,
      'Content-Type': 'application/json',
    } as Record<string, string>;
    const body = JSON.stringify(updates || []);
    const resp = await this.makeRequest<any>(
      '/stock/v1/inventory/update',
      'PUT',
      body,
      undefined,
      headers
    );
    const arr = Array.isArray(resp) ? resp : (resp?.data || []);
    return arr as any[];
  }
}

export default ToastAPIClient;