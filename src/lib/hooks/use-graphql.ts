// @ts-ignore
import { useQuery, useMutation, QueryHookOptions } from "@apollo/client/react";
import { gql } from "@apollo/client";


export const GLOBAL_SEARCH = gql`
  query GlobalSearch($query: String!, $limit: Int) {
    globalSearch(query: $query, limit: $limit) {
      id
      kind
      title
      description
      route
      score
    }
  }
`;

export const useGlobalSearch = (
  query: string,
  limit = 8,
  options?: any
) =>
  useQuery<any, any>(GLOBAL_SEARCH, {
    variables: { query, limit },
    ...(options as any),
  });

export const GET_LOW_STOCK_ITEMS = gql`
  query GetLowStockItems($limit: Int) {
    lowStockItems(limit: $limit) {
      id
      name
      partNumber
      unit
      currentStock
      minThreshold
      parLevel
      reorderPoint
      status
      supplierName
      preferredSupplier
      wasteCategory
      waste
    }
  }
`;

export const useLowStockItems = (limit = 8, options?: QueryHookOptions<any, { limit: number }>) =>
  useQuery<any, any>(GET_LOW_STOCK_ITEMS, {
    variables: { limit },
    ...(options as any),
  });


// Team & Scheduling
export const GET_TEAM_MEMBERS = gql`
  query GetTeamMembers {
    teamMembers {
      id
      name
      email
      phone
      role
      department
      status
      joinDate
      hourlyRate
      availability
      skills
      certifications
      performance {
        rating
        completedShifts
        onTimeRate
        comebacks
        upsellCaptureRate
        aseCertifications
      }
    }
  }
`;

export const GET_SHIFTS = gql`
  query GetShifts($startDate: Date, $endDate: Date) {
    shifts(startDate: $startDate, endDate: $endDate) {
      id
      date
      startTime
      endTime
      role
      status
      breakTime
      assignedTo {
        id
        name
        role
        department
      }
    }
  }
`;

export const useTeamMembers = () => useQuery<any, any>(GET_TEAM_MEMBERS);
export const useShifts = (variables?: { startDate?: string; endDate?: string }) =>
  useQuery<any, any>(GET_SHIFTS, { variables });

export const GET_TEAM_PERFORMANCE = gql`
  query GetTeamPerformance($memberId: ID, $limit: Int, $flagsOnly: Boolean) {
    teamPerformance(memberId: $memberId, limit: $limit, flagsOnly: $flagsOnly) {
      teamMember {
        id
        name
        role
        department
        status
        performance {
          rating
          completedShifts
          onTimeRate
          comebacks
          upsellCaptureRate
          aseCertifications
        }
      }
      averageRating
      completedShifts
      redFlags
      yellowFlags
      blueFlags
      totalFlags
      recentEntries {
        id
        teamMemberId
        rating
        isFlag
        flagType
        details
        salesGenerated
        date
      }
    }
  }
`;

export const useTeamPerformance = (variables?: { memberId?: string; limit?: number; flagsOnly?: boolean }) =>
  useQuery<any, any>(GET_TEAM_PERFORMANCE, { variables });

export const CREATE_SHIFT = gql`
  mutation CreateShift($input: ShiftInput!) {
    createShift(input: $input) {
      id
      date
      startTime
      endTime
      role
      status
      breakTime
      notes
      assignedTo {
        id
        name
        role
        department
      }
    }
  }
`;

export const UPDATE_SHIFT = gql`
  mutation UpdateShift($id: ID!, $input: ShiftInput!) {
    updateShift(id: $id, input: $input) {
      id
      date
      startTime
      endTime
      role
      status
      breakTime
      notes
      assignedTo {
        id
        name
        role
        department
      }
    }
  }
`;

export const DELETE_SHIFT = gql`
  mutation DeleteShift($id: ID!) {
    deleteShift(id: $id)
  }
`;

export const useCreateShift = () =>
  useMutation(CREATE_SHIFT, { refetchQueries: ["GetShifts"] });
export const useUpdateShift = () =>
  useMutation(UPDATE_SHIFT, { refetchQueries: ["GetShifts"] });
export const useDeleteShift = () =>
  useMutation(DELETE_SHIFT, { refetchQueries: ["GetShifts"] });

// Inventory
export const GET_INVENTORY_ITEMS = gql`
  query GetInventoryItems($search: String, $filterCategory: String, $pagination: PaginationInput) {
    inventoryItems(search: $search, filterCategory: $filterCategory, pagination: $pagination) {
      totalCount
      items {
        id
        name
        category
        subcategory
        segment
        partNumber
        oemPartNumber
        aftermarketPartNumber
        brand
        manufacturer
        description
        unit
        currentStock
        minThreshold
        parLevel
        restockPeriod
        restockDays
        reorderPoint
        reorderQuantity
        safetyStock
        maxCapacity
        costPerUnit
        msrp
        warrantyMonths
        coreCharge
        status
        supplierName
        preferredSupplier
        vendorSku
        alternateSuppliers {
          name
          contact
          phone
          sku
          price
          leadTimeDays
        }
        contractPricingTier
        leadTimeDays
        averageMonthlyUsage
        averageDailyUsage
        lastStockedDate
        lastIssuedDate
        minimumOrderQuantity
        palletQuantity
        wasteCategory
        waste
        wasteNotes
        wasteLogs {
          id
          date
          quantity
          unitCost
          label
          reason
          notes
          recordedById
          recordedByName
        }
        totalValue
      }
    }
  }
`;

export const GET_INVENTORY_SUMMARY = gql`
  query GetInventorySummary {
    inventorySummary {
      totalParts
      totalInventoryValue
      criticalParts
      lowStockParts
      specialOrderParts
      topCategories {
        category
        value
        quantity
      }
    }
  }
`;

export const GET_INVENTORY_ALERTS = gql`
  query GetInventoryAlerts {
    inventoryAlerts {
      id
      severity
      condition
      message
      inventoryItem {
        id
        name
        partNumber
        category
        status
      }
    }
  }
`;

export const CREATE_INVENTORY_ITEM = gql`
  mutation CreateInventoryItem($input: InventoryItemInput!) {
    createInventoryItem(input: $input) {
      id
      name
      partNumber
      category
      currentStock
      status
    }
  }
`;

export const UPDATE_INVENTORY_ITEM = gql`
  mutation UpdateInventoryItem($id: ID!, $input: InventoryItemInput!) {
    updateInventoryItem(id: $id, input: $input) {
      id
      name
      partNumber
      category
      currentStock
      status
    }
  }
`;

export const DELETE_INVENTORY_ITEM = gql`
  mutation DeleteInventoryItem($id: ID!) {
    deleteInventoryItem(id: $id)
  }
`;

export const RECORD_INVENTORY_TRANSACTION = gql`
  mutation RecordInventoryTransaction(
    $itemId: ID!
    $quantity: Float!
    $unitCost: Float!
    $transactionType: String!
    $reason: String
    $referenceType: String
    $referenceId: ID
    $referenceNumber: String
  ) {
    recordInventoryTransaction(
      itemId: $itemId
      quantity: $quantity
      unitCost: $unitCost
      transactionType: $transactionType
      reason: $reason
      referenceType: $referenceType
      referenceId: $referenceId
      referenceNumber: $referenceNumber
    ) {
      id
      transactionType
      quantity
      unitCost
      totalCost
      balanceAfter
      createdAt
    }
  }
`;

export const useInventoryItems = (variables?: { search?: string; filterCategory?: string; pagination?: { page?: number; pageSize?: number } }) =>
  useQuery<any, any>(GET_INVENTORY_ITEMS, { variables });
export const useInventorySummary = () => useQuery<any, any>(GET_INVENTORY_SUMMARY);
export const useInventoryAlerts = () => useQuery<any, any>(GET_INVENTORY_ALERTS);
export const useCreateInventoryItem = () => useMutation(CREATE_INVENTORY_ITEM, { refetchQueries: ["GetInventoryItems", "GetInventorySummary", "GetInventoryAlerts"] });
export const useUpdateInventoryItem = () => useMutation(UPDATE_INVENTORY_ITEM, { refetchQueries: ["GetInventoryItems", "GetInventorySummary", "GetInventoryAlerts"] });
export const useDeleteInventoryItem = () => useMutation(DELETE_INVENTORY_ITEM, { refetchQueries: ["GetInventoryItems", "GetInventorySummary", "GetInventoryAlerts"] });
export const useRecordInventoryTransaction = () => useMutation(RECORD_INVENTORY_TRANSACTION, { refetchQueries: ["GetInventoryItems", "GetInventorySummary"] });
export const RECORD_INVENTORY_WASTE = gql`
  mutation RecordInventoryWaste($itemId: ID!, $quantity: Float!, $reason: String!, $label: String, $notes: String, $unitCost: Float, $recordedAt: Date) {
    recordInventoryWaste(itemId: $itemId, quantity: $quantity, reason: $reason, label: $label, notes: $notes, unitCost: $unitCost, recordedAt: $recordedAt) {
      id
      name
      currentStock
      waste
      wasteCategory
      wasteNotes
      wasteLogs {
        id
        date
        quantity
        label
        reason
        notes
        recordedByName
      }
    }
  }
`;
export const useRecordInventoryWaste = () =>
  useMutation(RECORD_INVENTORY_WASTE, { refetchQueries: ["GetInventoryItems", "GetInventorySummary", "GetInventoryAlerts"] });

export const GET_WASTE_REPORT = gql`
  query GetWasteReport($startDate: Date, $endDate: Date, $supplierId: ID, $category: String) {
    wasteReport(startDate: $startDate, endDate: $endDate, supplierId: $supplierId, category: $category) {
      id
      item {
        id
        name
        partNumber
        category
        supplierName
        preferredSupplier
      }
      quantity
      unitCost
      totalCost
      label
      reason
      recordedAt
      recordedByName
    }
  }
`;
export const useWasteReport = (variables?: { startDate?: string; endDate?: string; supplierId?: string; category?: string }) =>
  useQuery<any, any>(GET_WASTE_REPORT, { variables });
// Suppliers & Purchasing
export const GET_SUPPLIERS = gql`
  query GetSuppliers {
    suppliers {
      id
      name
      companyName
      supplierCode
      type
      categories
      status
      preferred
    }
  }
`;

export const GET_SUPPLIER_PERFORMANCE = gql`
  query GetSupplierPerformance($startDate: Date, $endDate: Date) {
    supplierPerformance(startDate: $startDate, endDate: $endDate) {
      supplier {
        id
        name
        companyName
        type
        status
      }
      totalOrders
      totalSpend
      averageLeadTimeDays
      fillRate
      onTimeDeliveryRate
      wasteCost
    }
  }
`;

export const CREATE_SUPPLIER = gql`
  mutation CreateSupplier($name: String!, $companyName: String!, $type: String!, $categories: [String!], $preferred: Boolean, $notes: String) {
    createSupplier(name: $name, companyName: $companyName, type: $type, categories: $categories, preferred: $preferred, notes: $notes) {
      id
      name
      companyName
      type
      status
      preferred
    }
  }
`;

export const UPDATE_SUPPLIER = gql`
  mutation UpdateSupplier($id: ID!, $type: String, $categories: [String!], $status: String, $preferred: Boolean, $notes: String) {
    updateSupplier(id: $id, type: $type, categories: $categories, status: $status, preferred: $preferred, notes: $notes) {
      id
      name
      companyName
      status
      preferred
    }
  }
`;

export const GET_PURCHASE_ORDERS = gql`
  query GetPurchaseOrders($status: String) {
    purchaseOrders(status: $status) {
      id
      poNumber
      status
      orderDate
      expectedDeliveryDate
      receivedDate
      subtotal
      tax
      freight
      total
      supplier {
        id
        name
      }
      items {
        name
        partNumber
        quantityOrdered
        quantityReceived
        unit
        unitCost
        totalCost
      }
    }
  }
`;

export const CREATE_PURCHASE_ORDER = gql`
  mutation CreatePurchaseOrder($supplierId: ID!, $items: [PurchaseOrderItemInput!]!, $notes: String, $expectedDeliveryDate: Date) {
    createPurchaseOrder(supplierId: $supplierId, items: $items, notes: $notes, expectedDeliveryDate: $expectedDeliveryDate) {
      id
      poNumber
      status
      supplier {
        id
        name
      }
    }
  }
`;

export const UPDATE_PURCHASE_ORDER_STATUS = gql`
  mutation UpdatePurchaseOrderStatus($id: ID!, $status: String!, $receivedDate: Date) {
    updatePurchaseOrderStatus(id: $id, status: $status, receivedDate: $receivedDate) {
      id
      poNumber
      status
      receivedDate
    }
  }
`;

export const useSuppliers = () => useQuery<any, any>(GET_SUPPLIERS);
export const useSupplierPerformance = (variables?: { startDate?: string; endDate?: string }) =>
  useQuery<any, any>(GET_SUPPLIER_PERFORMANCE, { variables });
export const usePurchaseOrders = (variables?: { status?: string }) => useQuery<any, any>(GET_PURCHASE_ORDERS, { variables });
export const useCreateSupplier = () => useMutation(CREATE_SUPPLIER, { refetchQueries: ["GetSuppliers"] });
export const useUpdateSupplier = () => useMutation(UPDATE_SUPPLIER, { refetchQueries: ["GetSuppliers"] });
export const useCreatePurchaseOrder = () => useMutation(CREATE_PURCHASE_ORDER, { refetchQueries: ["GetPurchaseOrders", "GetInventoryItems"] });
export const useUpdatePurchaseOrderStatus = () => useMutation(UPDATE_PURCHASE_ORDER_STATUS, { refetchQueries: ["GetPurchaseOrders", "GetInventoryItems", "GetInventorySummary"] });
// Service Catalog
export const GET_SERVICE_PACKAGES = gql`
  query GetServicePackages($category: String, $search: String) {
    servicePackages(category: $category, search: $search) {
      id
      serviceCode
      name
      shortName
      category
      subcategory
      description
      laborHours
      basePrice
      bayType
      skillLevel
      warrantyMonths
      sameDayEligible
      isFeatured
      recommendedParts {
        id
        quantity
        unit
        note
        part {
          id
          name
          partNumber
          currentStock
          status
        }
      }
    }
  }
`;

export const GET_SERVICE_PACKAGE = gql`
  query GetServicePackage($id: ID!) {
    servicePackage(id: $id) {
      id
      serviceCode
      name
      shortName
      category
      subcategory
      description
      detailedSteps
      laborHours
      basePrice
      bayType
      skillLevel
      warrantyMonths
      serviceIntervalMiles
      serviceIntervalMonths
      requiredEquipment
      upsellRecommendations
      inspectionChecklist
      safetyNotes
      sameDayEligible
      isSeasonal
      isFeatured
      recommendedParts {
        id
        quantity
        unit
        note
        part {
          id
          name
          partNumber
        }
      }
    }
  }
`;

export const CREATE_SERVICE_PACKAGE = gql`
  mutation CreateServicePackage($input: ServicePackageInput!) {
    createServicePackage(input: $input) {
      id
      serviceCode
      name
      category
    }
  }
`;

export const UPDATE_SERVICE_PACKAGE = gql`
  mutation UpdateServicePackage($id: ID!, $input: ServicePackageInput!) {
    updateServicePackage(id: $id, input: $input) {
      id
      serviceCode
      name
      category
    }
  }
`;

export const DELETE_SERVICE_PACKAGE = gql`
  mutation DeleteServicePackage($id: ID!) {
    deleteServicePackage(id: $id)
  }
`;

export const useServicePackages = (variables?: { category?: string; search?: string }) =>
  useQuery<any, any>(GET_SERVICE_PACKAGES, { variables });
export const useServicePackage = (id?: string) =>
  useQuery<any, any>(GET_SERVICE_PACKAGE, { variables: id ? { id } : undefined, skip: !id } as any);
export const useCreateServicePackage = () => useMutation<any, any>(CREATE_SERVICE_PACKAGE, { refetchQueries: ["GetServicePackages"] });
export const useUpdateServicePackage = () => useMutation(UPDATE_SERVICE_PACKAGE, { refetchQueries: ["GetServicePackages"] });
export const useDeleteServicePackage = () => useMutation(DELETE_SERVICE_PACKAGE, { refetchQueries: ["GetServicePackages"] });

// Service Lane
export const GET_SERVICE_BAYS = gql`
  query GetServiceBays($includeOutOfService: Boolean) {
    serviceBays(includeOutOfService: $includeOutOfService) {
      id
      label
      type
      status
      capacity
      queueDepth
      features
      notes
      assignedTechnician {
        id
        name
        role
      }
      currentTicket {
        id
        ticketNumber
        status
        customerName
        promisedTime
      }
    }
  }
`;

export const GET_SERVICE_LANE_TICKETS = gql`
  query GetServiceLaneTickets($status: String) {
    serviceLaneTickets(status: $status) {
      id
      ticketNumber
      customerName
      status
      dropoffTime
      promisedTime
      recommendedFollowUps
      vehicle {
        make
        model
        year
        mileageIn
      }
      advisor {
        id
        name
      }
      primaryTechnician {
        id
        name
      }
      bay {
        id
        label
        type
      }
      services {
        servicePackage {
          id
          name
          category
        }
        status
        estimatedHours
        actualHours
        estimatedPrice
        approved
        technicianNotes
      }
      notes {
        timestamp
        author
        message
        kind
      }
    }
  }
`;

export const CREATE_SERVICE_LANE_TICKET = gql`
  mutation CreateServiceLaneTicket($input: ServiceLaneTicketInput!) {
    createServiceLaneTicket(input: $input) {
      id
      ticketNumber
      status
    }
  }
`;

export const UPDATE_SERVICE_LANE_TICKET = gql`
  mutation UpdateServiceLaneTicket($id: ID!, $input: ServiceLaneTicketInput!) {
    updateServiceLaneTicket(id: $id, input: $input) {
      id
      ticketNumber
      status
    }
  }
`;

export const UPDATE_SERVICE_LANE_TICKET_STATUS = gql`
  mutation UpdateServiceLaneTicketStatus($id: ID!, $status: String!, $bayId: ID, $primaryTechnician: ID) {
    updateServiceLaneTicketStatus(id: $id, status: $status, bayId: $bayId, primaryTechnician: $primaryTechnician) {
      id
      ticketNumber
      status
      bay {
        id
        label
      }
    }
  }
`;

export const useServiceBays = (variables?: { includeOutOfService?: boolean }) =>
  useQuery<any, any>(GET_SERVICE_BAYS, { variables });
export const useServiceLaneTickets = (variables?: { status?: string }) =>
  useQuery<any, any>(GET_SERVICE_LANE_TICKETS, { variables });
export const useCreateServiceLaneTicket = () => useMutation(CREATE_SERVICE_LANE_TICKET, { refetchQueries: ["GetServiceLaneTickets", "GetServiceBays"] });
export const useUpdateServiceLaneTicket = () => useMutation(UPDATE_SERVICE_LANE_TICKET, { refetchQueries: ["GetServiceLaneTickets", "GetServiceBays"] });
export const useUpdateServiceLaneTicketStatus = () => useMutation(UPDATE_SERVICE_LANE_TICKET_STATUS, { refetchQueries: ["GetServiceLaneTickets", "GetServiceBays"] });
// Automation & Equipment
export const GET_AUTOMATION_ASSETS = gql`
  query GetAutomationAssets {
    automationAssets {
      id
      name
      type
      status
      zone
      utilizationRate
      firmwareVersion
      nextServiceDate
      healthScore
      notes
      assignedBay {
        id
        label
      }
    }
  }
`;

export const CREATE_AUTOMATION_ASSET = gql`
  mutation CreateAutomationAsset($name: String!, $type: String!, $zone: String, $assignedBay: ID, $status: String, $manufacturer: String, $modelNumber: String) {
    createAutomationAsset(name: $name, type: $type, zone: $zone, assignedBay: $assignedBay, status: $status, manufacturer: $manufacturer, modelNumber: $modelNumber) {
      id
      name
      type
      status
    }
  }
`;

export const UPDATE_AUTOMATION_ASSET = gql`
  mutation UpdateAutomationAsset($id: ID!, $status: String, $utilizationRate: Float, $firmwareVersion: String, $nextServiceDate: Date, $notes: String) {
    updateAutomationAsset(id: $id, status: $status, utilizationRate: $utilizationRate, firmwareVersion: $firmwareVersion, nextServiceDate: $nextServiceDate, notes: $notes) {
      id
      name
      status
      utilizationRate
      nextServiceDate
      notes
    }
  }
`;

export const useAutomationAssets = () => useQuery<any, any>(GET_AUTOMATION_ASSETS);
export const useCreateAutomationAsset = () => useMutation(CREATE_AUTOMATION_ASSET, { refetchQueries: ["GetAutomationAssets"] });
export const useUpdateAutomationAsset = () => useMutation(UPDATE_AUTOMATION_ASSET, { refetchQueries: ["GetAutomationAssets"] });

// Analytics
export const GET_SHOP_ANALYTICS = gql`
  query GetShopAnalytics($period: String!, $startDate: Date, $endDate: Date) {
    shopAnalytics(period: $period, startDate: $startDate, endDate: $endDate) {
      period
      date
      totalRevenue
      laborRevenue
      partsRevenue
      grossProfit
      vehiclesServiced
      averageRepairOrder
      bayUtilization
      technicianEfficiency
      diagnosticCaptureRate
      partsTurnoverDays
      comebackRate
      customerSatisfaction
      firstTimeFixRate
      openEstimates
      warrantyClaims
      topServiceCategories {
        category
        value
        change
      }
      fleetVsRetailMix {
        category
        value
        change
      }
      revenueTrend {
        timestamp
        label
        value
      }
      bayPerformance {
        utilization
        throughput
        averageCycleTimeMinutes
        bay {
          id
          label
          type
        }
      }
      technicianLeaderboard {
        hoursFlagged
        billedHours
        efficiency
        comebacks
        upsellRate
        technician {
          id
          name
          role
        }
      }
      alerts {
        severity
        title
        message
        suggestedAction
      }
    }
  }
`;

export const useShopAnalytics = (variables: { period: string; startDate?: string; endDate?: string }) =>
  useQuery<any, any>(GET_SHOP_ANALYTICS, { variables });

// Invoicing
export const GET_INVOICES = gql`
  query GetInvoices($status: String, $search: String, $pagination: PaginationInput) {
    invoices(status: $status, search: $search, pagination: $pagination) {
      totalCount
      items {
        id
        invoiceNumber
        clientName
        status
        issuedDate
        dueDate
        totalAmount
        balanceDue
        advisor {
          id
          name
        }
        serviceLaneTicket {
          id
          ticketNumber
          status
        }
      }
    }
  }
`;

export const GET_INVOICE = gql`
  query GetInvoice($id: ID!) {
    invoice(id: $id) {
      id
      invoiceNumber
      clientName
      clientEmail
      clientPhone
      status
      issuedDate
      dueDate
      amount
      laborTotal
      partsTotal
      tax
      shopSupplies
      hazmatFee
      discounts
      totalAmount
      balanceDue
      notes
      warrantyNotes
      vehicle {
        vin
        year
        make
        model
        mileageIn
        mileageOut
      }
      advisor {
        id
        name
      }
      laborLines {
        description
        hours
        rate
        total
        technician {
          id
          name
        }
        servicePackage {
          id
          name
        }
      }
      partsLines {
        description
        quantity
        unitPrice
        total
        taxable
        inventoryItem {
          id
          name
          partNumber
        }
      }
      payments {
        amount
        method
        reference
        receivedBy
        date
      }
      followUpReminders {
        description
        dueDate
      }
    }
  }
`;

export const CREATE_INVOICE = gql`
  mutation CreateInvoice($input: InvoiceInput!) {
    createInvoice(input: $input) {
      id
      invoiceNumber
      status
    }
  }
`;

export const UPDATE_INVOICE = gql`
  mutation UpdateInvoice($id: ID!, $input: InvoiceInput!) {
    updateInvoice(id: $id, input: $input) {
      id
      invoiceNumber
      status
    }
  }
`;

export const ADD_INVOICE_PAYMENT = gql`
  mutation AddInvoicePayment($input: InvoicePaymentInput!) {
    addInvoicePayment(input: $input) {
      id
      invoiceNumber
      balanceDue
      payments {
        amount
        method
        date
      }
    }
  }
`;

export const UPDATE_INVOICE_STATUS = gql`
  mutation UpdateInvoiceStatus($id: ID!, $status: String!) {
    updateInvoiceStatus(id: $id, status: $status) {
      id
      invoiceNumber
      status
      paidDate
    }
  }
`;

export const useInvoices = (variables?: { status?: string; search?: string; pagination?: { page?: number; pageSize?: number } }) =>
  useQuery<any, any>(GET_INVOICES, { variables });
export const useInvoice = (id?: string) =>
  useQuery<any, any>(GET_INVOICE, { variables: id ? { id } : undefined, skip: !id } as any);
export const useCreateInvoice = () => useMutation<any, any>(CREATE_INVOICE, { refetchQueries: ["GetInvoices"] });
export const useUpdateInvoice = () => useMutation(UPDATE_INVOICE, { refetchQueries: ["GetInvoices", "GetInvoice"] });
export const useAddInvoicePayment = () => useMutation(ADD_INVOICE_PAYMENT, { refetchQueries: ["GetInvoice", "GetInvoices"] });
export const useUpdateInvoiceStatus = () => useMutation(UPDATE_INVOICE_STATUS, { refetchQueries: ["GetInvoice", "GetInvoices"] });

// Mocks for missing hooks
export const useInventoryMovement = (...args: any[]) => ({ data: { inventoryMovement: [] }, refetch: () => { }, loading: false, error: null });
export const useABCAnalysis = (...args: any[]) => ({ data: { abcAnalysis: [] }, refetch: () => { }, loading: false, error: null });
export const useTurnoverSeries = (...args: any[]) => ({ data: { inventoryTurnoverSeries: [] }, refetch: () => { }, loading: false, error: null });
export const useRecipeProfitability = (...args: any[]) => ({ data: { recipeProfitabilityReport: [] }, refetch: () => { }, loading: false, error: null });
