import { gql } from "@apollo/client";

export const typeDefs = gql`
  scalar Date
  scalar JSON

  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    avatar: String
    isActive: Boolean
    lastLogin: Date
    permissions: [String!]
    createdAt: Date!
    updatedAt: Date!
  }


  type StorageLocation {
    aisle: String
    shelf: String
    bin: String
  }

  type Compatibility {
    make: String
    models: [String!]
    years: [Int!]
    notes: String
  }

  type DocumentAttachment {
    name: String
    url: String
    type: String
    uploadedAt: Date
  }

  type SupplierProgram {
    name: String
    description: String
    effectiveDate: Date
    expirationDate: Date
    rebatePercent: Float
  }

  type Supplier {
    id: ID!
    name: String!
    companyName: String!
    supplierCode: String
    type: String!
    categories: [String!]
    status: String!
    contacts: [SupplierContact!]
    address: SupplierAddress
    paymentTerms: SupplierPaymentTerms
    logistics: SupplierLogistics
    performanceMetrics: SupplierPerformance
    programs: [SupplierProgram!]
    accreditations: [SupplierAccreditation!]
    digitalPortals: [SupplierPortal!]
    documents: [DocumentAttachment!]
    preferred: Boolean!
    notes: String
    createdAt: Date!
    updatedAt: Date!
  }

  type SupplierContact {
    name: String
    title: String
    email: String
    phone: String
    mobile: String
    isPrimary: Boolean
  }

  type SupplierAddress {
    street: String
    city: String
    state: String
    zipCode: String
    country: String
  }

  type SupplierPaymentTerms {
    terms: String
    customTerms: String
    creditLimit: Float
    currentBalance: Float
    currency: String
  }

  type SupplierLogistics {
    deliveryDays: [String!]
    deliveryWindow: String
    minimumOrder: Float
    freightMethod: String
    dropShipAvailable: Boolean
    leadTimeDays: Int
    expeditedLeadTimeDays: Int
    shippingAccount: String
  }

  type SupplierPerformance {
    totalOrders: Int
    totalSpend: Float
    averageLeadTimeDays: Float
    onTimeDeliveryRate: Float
    fillRate: Float
    qualityScore: Float
    warrantyClaims: Int
    lastEvaluation: Date
  }

  type SupplierAccreditation {
    name: String
    issuedBy: String
    certificationId: String
    issuedAt: Date
    expiresAt: Date
    notes: String
  }

  type SupplierPortal {
    name: String
    url: String
    username: String
  }

  type AlternateSupplier {
    name: String
    contact: String
    phone: String
    sku: String
    price: Float
    leadTimeDays: Int
  }

  type WasteLog {
    id: ID!
    date: Date!
    quantity: Float!
    unitCost: Float
    label: String
    reason: String!
    notes: String
    recordedById: ID
    recordedByName: String
    recordedBy: User
  }

  type WasteReportEntry {
    id: ID!
    item: InventoryItem!
    quantity: Float!
    unitCost: Float!
    totalCost: Float!
    label: String
    reason: String!
    recordedAt: Date!
    recordedByName: String
  }


  type SupplierPerformanceSummary {
    supplier: Supplier!
    totalOrders: Int!
    totalSpend: Float!
    averageLeadTimeDays: Float!
    fillRate: Float!
    onTimeDeliveryRate: Float!
    wasteCost: Float!
  }

  type TeamPerformanceEntry {
    id: ID!
    teamMemberId: ID!
    rating: Float
    isFlag: Boolean!
    flagType: String
    details: String
    salesGenerated: Float
    date: Date!
  }

  type TeamPerformanceSummary {
    teamMember: TeamMember!
    averageRating: Float
    completedShifts: Int
    redFlags: Int!
    yellowFlags: Int!
    blueFlags: Int!
    totalFlags: Int!
    recentEntries: [TeamPerformanceEntry!]
  }


  type InventoryItem {
    id: ID!
    name: String!
    category: String!
    subcategory: String
    segment: String
    partNumber: String!
    oemPartNumber: String
    aftermarketPartNumber: String
    barcode: String
    brand: String
    manufacturer: String
    description: String
    compatibility: [Compatibility!]
    universalFit: Boolean!
    vehicleSystems: [String!]
    storageLocation: StorageLocation
    unit: String!
    currentStock: Float!
    minThreshold: Float!
    parLevel: Float
    restockPeriod: String
    restockDays: Int
    reorderPoint: Float!
    reorderQuantity: Float!
    safetyStock: Float!
    maxCapacity: Float!
    costPerUnit: Float!
    msrp: Float
    laborMarkup: Float
    warrantyMonths: Int
    coreCharge: Float
    shelfLifeMonths: Int
    hazardClass: String
    weightLbs: Float
    volumeCubicFt: Float
    supplier: Supplier
    supplierName: String
    supplierPartNumber: String
    vendorSku: String
    preferredSupplier: String
    alternateSuppliers: [AlternateSupplier!]
    contractPricingTier: String
    leadTimeDays: Int
    minimumOrderQuantity: Float
    palletQuantity: Float
    averageMonthlyUsage: Float
    averageDailyUsage: Float
    lastStockedDate: Date
    lastIssuedDate: Date
    nextServiceReminderMiles: Int
    nextServiceReminderMonths: Int
    wasteCategory: String
    waste: Float
    wasteNotes: String
    wasteLogs: [WasteLog!]
    images: [String!]
    documents: [DocumentAttachment!]
    notes: String
    status: String!
    totalValue: Float!
    createdAt: Date!
    updatedAt: Date!
  }

  type InventorySummary {
    totalParts: Int!
    totalInventoryValue: Float!
    criticalParts: Int!
    lowStockParts: Int!
    specialOrderParts: Int!
     totalWasteQuantity: Float!
    totalWasteCost: Float!
    topCategories: [InventoryCategoryTotal!]
  }

  type InventoryCategoryTotal {
    category: String!
    value: Float!
    quantity: Float!
  }

  type InventoryAlert {
    id: ID!
    inventoryItem: InventoryItem!
    condition: String!
    severity: String!
    message: String!
  }

  type PurchaseOrderItem {
    inventoryItem: InventoryItem
    name: String!
    partNumber: String
    quantityOrdered: Float!
    quantityReceived: Float!
    unit: String!
    unitCost: Float!
    totalCost: Float!
    backorderedQuantity: Float!
    expectedShipDate: Date
    notes: String
  }

  type PurchaseOrder {
    id: ID!
    poNumber: String!
    supplier: Supplier!
    supplierName: String!
    status: String!
    orderDate: Date!
    expectedShipDate: Date
    expectedDeliveryDate: Date
    receivedDate: Date
    billingTerms: String
    shippingMethod: String
    receivingLocation: String
    items: [PurchaseOrderItem!]!
    subtotal: Float!
    tax: Float!
    freight: Float!
    miscFees: Float!
    total: Float!
    notes: String
    createdAt: Date!
    updatedAt: Date!
  }

  type InventoryTransaction {
    id: ID!
    inventoryItem: InventoryItem!
    itemName: String!
    transactionType: String!
    quantity: Float!
    unit: String!
    unitCost: Float!
    totalCost: Float!
    balanceBefore: Float!
    balanceAfter: Float!
    bay: ServiceBay
    serviceTicket: ServiceLaneTicket
    reason: String
    referenceType: String!
    referenceId: ID
    referenceNumber: String
    createdAt: Date!
  }

  type Performance {
    rating: Float!
    completedShifts: Int!
    onTimeRate: Float!
    comebacks: Int!
    upsellCaptureRate: Float!
    aseCertifications: [String!]
  }

  type TeamMember {
    id: ID!
    name: String!
    email: String!
    phone: String
    role: String!
    department: String!
    status: String!
    joinDate: Date!
    hourlyRate: Float!
    availability: String!
    skills: [String!]!
    certifications: [String!]
    performance: Performance
    toastId: String
    avatar: String
    lastLogin: Date
  }

  type Shift {
    id: ID!
    date: Date!
    startTime: String!
    endTime: String!
    role: String!
    assignedTo: TeamMember!
    status: String!
    notes: String
    breakTime: Int
    createdAt: Date!
    updatedAt: Date!
  }

  input CreateUserInput {\n    name: String!\n    email: String!\n    role: String\n    avatar: String\n    permissions: [String!]\n    isActive: Boolean\n  }\n\n  input UpdateUserInput {\n    name: String\n    email: String\n    role: String\n    avatar: String\n    permissions: [String!]\n    isActive: Boolean\n  }\n\n  input ShiftInput {
    date: Date!
    startTime: String!
    endTime: String!
    role: String!
    assignedTo: ID!
    status: String
    notes: String
    breakTime: Int
  }

  type RecommendedPart {
    id: ID!
    part: InventoryItem!
    quantity: Float!
    unit: String!
    note: String
  }

  type ServicePackage {
    id: ID!
    serviceCode: String!
    name: String!
    shortName: String
    category: String!
    subcategory: String
    description: String
    detailedSteps: [String!]
    laborHours: Float!
    basePrice: Float!
    bayType: String!
    skillLevel: String!
    warrantyMonths: Int
    serviceIntervalMiles: Int
    serviceIntervalMonths: Int
    recommendedParts: [RecommendedPart!]
    requiredEquipment: [String!]
    upsellRecommendations: [String!]
    inspectionChecklist: [String!]
    safetyNotes: String
    sameDayEligible: Boolean!
    isSeasonal: Boolean!
    isFeatured: Boolean!
    createdAt: Date!
    updatedAt: Date!
  }

  type ServiceBay {
    id: ID!
    label: String!
    type: String!
    status: String!
    assignedTechnician: TeamMember
    currentTicket: ServiceLaneTicket
    capacity: Int!
    queueDepth: Int!
    features: [String!]
    lastInspection: Date
    nextMaintenance: Date
    notes: String
  }

  type TicketService {
    servicePackage: ServicePackage!
    status: String!
    estimatedHours: Float
    actualHours: Float
    estimatedPrice: Float
    approved: Boolean!
    technicianNotes: String
  }

  type TicketNote {
    timestamp: Date!
    author: String
    message: String!
    kind: String!
  }

  type VehicleInfo {
    vin: String
    year: Int
    make: String
    model: String
    trim: String
    mileageIn: Int
    mileageOut: Int
    licensePlate: String
    color: String
    fuelType: String
    drivetrain: String
  }

  type ServiceLaneTicket {
    id: ID!
    ticketNumber: String!
    customerName: String!
    customerContactPhone: String
    customerContactEmail: String
    prefersText: Boolean!
    vehicle: VehicleInfo
    services: [TicketService!]!
    advisor: TeamMember
    primaryTechnician: TeamMember
    bay: ServiceBay
    status: String!
    dropoffTime: Date
    promisedTime: Date
    actualStartTime: Date
    actualCompletionTime: Date
    nextFollowUpDate: Date
    recommendedFollowUps: [String!]
    notes: [TicketNote!]
    createdAt: Date!
    updatedAt: Date!
  }

  type AutomationTelemetryPoint {
    timestamp: Date!
    metric: String!
    value: Float!
    unit: String
  }

  type AutomationAsset {
    id: ID!
    assetTag: String
    name: String!
    type: String!
    manufacturer: String
    modelNumber: String
    status: String!
    firmwareVersion: String
    healthScore: Float!
    utilizationRate: Float!
    zone: String
    locationDescription: String
    assignedBay: ServiceBay
    connectedDevices: Int!
    telemetry: [AutomationTelemetryPoint!]
    lastHeartbeat: Date
    lastServiceDate: Date
    nextServiceDate: Date
    serviceIntervalDays: Int
    safetyAlerts: [AutomationAlert!]
    notes: String
    createdAt: Date!
    updatedAt: Date!
  }

  type AutomationAlert {
    level: String!
    message: String!
    createdAt: Date!
  }

  type AnalyticsSlice {
    category: String!
    value: Float!
    change: Float
  }

  type TechnicianMetric {
    technician: TeamMember
    hoursFlagged: Float
    billedHours: Float
    efficiency: Float
    comebacks: Int
    upsellRate: Float
  }

  type TimeSeriesPoint {
    timestamp: Date!
    label: String
    value: Float!
  }

  type ShopAnalytics {
    period: String!
    date: Date!
    totalRevenue: Float!
    laborRevenue: Float!
    partsRevenue: Float!
    grossProfit: Float!
    vehiclesServiced: Int!
    averageRepairOrder: Float!
    bayUtilization: Float!
    technicianEfficiency: Float!
    diagnosticCaptureRate: Float!
    partsTurnoverDays: Float!
    comebackRate: Float!
    customerSatisfaction: Float!
    firstTimeFixRate: Float!
    openEstimates: Int!
    warrantyClaims: Int!
    topServiceCategories: [AnalyticsSlice!]
    fleetVsRetailMix: [AnalyticsSlice!]
    revenueTrend: [TimeSeriesPoint!]
    bayPerformance: [BayPerformance!]
    technicianLeaderboard: [TechnicianMetric!]
    alerts: [AnalyticsAlert!]
  }

  type BayPerformance {
    bay: ServiceBay
    utilization: Float
    throughput: Int
    averageCycleTimeMinutes: Float
  }

  type AnalyticsAlert {
    severity: String!
    title: String!
    message: String!
    suggestedAction: String
  }

  type LaborLine {
    servicePackage: ServicePackage
    description: String!
    technician: TeamMember
    hours: Float!
    rate: Float!
    total: Float!
  }

  type PartsLine {
    inventoryItem: InventoryItem
    description: String!
    quantity: Float!
    unitPrice: Float!
    total: Float!
    taxable: Boolean!
  }

  type InvoicePayment {
    date: Date!
    amount: Float!
    method: String!
    reference: String
    receivedBy: String
  }

  type Invoice {
    id: ID!
    invoiceNumber: String!
    serviceLaneTicket: ServiceLaneTicket
    clientName: String!
    clientEmail: String
    clientPhone: String
    vehicle: VehicleInfo
    advisor: TeamMember
    amount: Float!
    laborTotal: Float!
    partsTotal: Float!
    tax: Float!
    shopSupplies: Float!
    hazmatFee: Float!
    discounts: Float!
    totalAmount: Float!
    balanceDue: Float!
    dueDate: Date!
    status: String!
    issuedDate: Date!
    paidDate: Date
    description: String
    paymentTerms: String
    laborLines: [LaborLine!]
    partsLines: [PartsLine!]
    payments: [InvoicePayment!]
    notes: String
    warrantyNotes: String
    followUpReminders: [FollowUpReminder!]
    createdAt: Date!
    updatedAt: Date!
  }

  type FollowUpReminder {
    description: String
    dueDate: Date
  }

  input PaginationInput {
    page: Int
    pageSize: Int
  }

  input InventoryItemInput {
    name: String!
    category: String!
    subcategory: String
    segment: String
    partNumber: String!
    oemPartNumber: String
    aftermarketPartNumber: String
    barcode: String
    brand: String
    manufacturer: String
    description: String
    compatibility: [CompatibilityInput!]
    universalFit: Boolean
    vehicleSystems: [String!]
    storageLocation: StorageLocationInput
    unit: String!
    currentStock: Float
    minThreshold: Float
    parLevel: Float
    restockPeriod: String
    restockDays: Int
    reorderPoint: Float
    reorderQuantity: Float
    safetyStock: Float
    maxCapacity: Float
    costPerUnit: Float!
    msrp: Float
    laborMarkup: Float
    warrantyMonths: Int
    coreCharge: Float
    shelfLifeMonths: Int
    hazardClass: String
    weightLbs: Float
    volumeCubicFt: Float
    supplier: ID
    supplierName: String
    supplierPartNumber: String
    vendorSku: String
    preferredSupplier: String
    alternateSuppliers: [AlternateSupplierInput!]
    contractPricingTier: String
    leadTimeDays: Int
    minimumOrderQuantity: Float
    palletQuantity: Float
    averageMonthlyUsage: Float
    averageDailyUsage: Float
    notes: String
    status: String
    wasteCategory: String
    waste: Float
    wasteNotes: String
    wasteLogs: [WasteLogInput!]
  }

  input AlternateSupplierInput {
    name: String
    contact: String
    phone: String
    sku: String
    price: Float
    leadTimeDays: Int
  }

  input WasteLogInput {
    date: Date
    quantity: Float!
    unitCost: Float
    label: String
    reason: String!
    notes: String
    recordedBy: ID
    recordedByName: String
  }

  input CompatibilityInput {
    make: String
    models: [String!]
    years: [Int!]
    notes: String
  }

  input StorageLocationInput {
    aisle: String
    shelf: String
    bin: String
  }

  input ServicePackageInput {
    serviceCode: String!
    name: String!
    shortName: String
    category: String!
    subcategory: String
    description: String
    detailedSteps: [String!]
    laborHours: Float!
    basePrice: Float!
    bayType: String
    skillLevel: String
    warrantyMonths: Int
    serviceIntervalMiles: Int
    serviceIntervalMonths: Int
    recommendedParts: [RecommendedPartInput!]
    requiredEquipment: [String!]
    upsellRecommendations: [String!]
    inspectionChecklist: [String!]
    safetyNotes: String
    sameDayEligible: Boolean
    isSeasonal: Boolean
    isFeatured: Boolean
  }

  input RecommendedPartInput {
    part: ID!
    quantity: Float!
    unit: String
    note: String
  }

  input ServiceLaneTicketInput {
    ticketNumber: String!
    customerName: String!
    customerContactPhone: String
    customerContactEmail: String
    prefersText: Boolean
    vehicle: VehicleInput
    services: [TicketServiceInput!]!
    advisor: ID
    primaryTechnician: ID
    bay: ID
    status: String
    dropoffTime: Date
    promisedTime: Date
    recommendedFollowUps: [String!]
    notes: [TicketNoteInput!]
  }

  input VehicleInput {
    vin: String
    year: Int
    make: String
    model: String
    trim: String
    mileageIn: Int
    mileageOut: Int
    licensePlate: String
    color: String
    fuelType: String
    drivetrain: String
  }

  input TicketServiceInput {
    servicePackage: ID!
    status: String
    estimatedHours: Float
    estimatedPrice: Float
    approved: Boolean
    technicianNotes: String
  }

  input TicketNoteInput {
    author: String
    message: String!
    kind: String
  }

  input InvoiceInput {
    serviceLaneTicket: ID
    clientName: String!
    clientEmail: String
    clientPhone: String
    vehicle: VehicleInput
    advisor: ID
    dueDate: Date!
    description: String
    paymentTerms: String
    laborLines: [LaborLineInput!]
    partsLines: [PartsLineInput!]
    shopSupplies: Float
    hazmatFee: Float
    discounts: Float
    tax: Float
    status: String
    notes: String
    warrantyNotes: String
    followUpReminders: [FollowUpReminderInput!]
  }

  input LaborLineInput {
    servicePackage: ID
    description: String!
    technician: ID
    hours: Float!
    rate: Float!
  }

  input PartsLineInput {
    inventoryItem: ID
    description: String!
    quantity: Float!
    unitPrice: Float!
    taxable: Boolean
  }

  input FollowUpReminderInput {
    description: String
    dueDate: Date
  }

  input InvoicePaymentInput {
    invoiceId: ID!
    amount: Float!
    method: String!
    reference: String
  }

  type PaginatedInventoryItems {
    items: [InventoryItem!]!
    totalCount: Int!
  }

  type GlobalSearchResult {
    id: ID!
    kind: String!
    title: String!
    description: String
    route: String!
    score: Float
  }

  type PaginatedInvoices {
    items: [Invoice!]!
    totalCount: Int!
  }

  # Inventory analytics
  type InventoryMovementPoint {
    date: String!
    dateKey: String!
    received: Float!
    usage: Float!
    adjustments: Float!
    totalValue: Float!
    netMovement: Float!
    transactionCount: Int!
    itemsCount: Int!
    shortfall: Float
  }

  type InventoryAnalyticsSummary {
    totalInventoryValue: Float!
    totalItems: Int!
    lowStockItems: Int!
    criticalItems: Int!
    wasteCostInPeriod: Float!
    wasteQtyInPeriod: Float!
    turnoverRatio: Float!
  }

  type ABCAnalysisRow {
    itemId: ID!
    name: String!
    value: Float!
    cumulativePct: Float!
    category: String!
  }

  type Query {
    me: User
    users: [User!]!
    globalSearch(query: String!, limit: Int): [GlobalSearchResult!]!
    teamMembers: [TeamMember!]!
    teamMember(id: ID!): TeamMember
    shifts(startDate: Date, endDate: Date): [Shift!]!
    shift(id: ID!): Shift
    inventoryItems(search: String, filterCategory: String, pagination: PaginationInput): PaginatedInventoryItems!
    inventoryItem(id: ID!): InventoryItem
    inventorySummary: InventorySummary!
    lowStockItems(limit: Int): [InventoryItem!]!
    inventoryAlerts: [InventoryAlert!]!
    suppliers: [Supplier!]!
    supplier(id: ID!): Supplier
    wasteReport(startDate: Date, endDate: Date, supplierId: ID, category: String): [WasteReportEntry!]!
    supplierPerformance(startDate: Date, endDate: Date): [SupplierPerformanceSummary!]!
    teamPerformance(memberId: ID, limit: Int, flagsOnly: Boolean): [TeamPerformanceSummary!]!
    purchaseOrders(status: String): [PurchaseOrder!]!
    purchaseOrder(id: ID!): PurchaseOrder
    inventoryTransactions(itemId: ID, limit: Int): [InventoryTransaction!]!
    servicePackages(category: String, search: String): [ServicePackage!]!
    servicePackage(id: ID!): ServicePackage
    featuredServicePackages: [ServicePackage!]!
    serviceBays(includeOutOfService: Boolean): [ServiceBay!]!
    serviceLaneTickets(status: String): [ServiceLaneTicket!]!
    automationAssets: [AutomationAsset!]!
    shopAnalytics(period: String!, startDate: Date, endDate: Date): [ShopAnalytics!]!
    inventoryMovement(period: String!, startDate: Date!, endDate: Date!, itemId: ID): [InventoryMovementPoint!]!
    inventoryAnalyticsSummary(startDate: Date!, endDate: Date!): InventoryAnalyticsSummary!
    abcAnalysis(startDate: Date!, endDate: Date!, metric: String): [ABCAnalysisRow!]!
    supplierPerformanceReport(startDate: Date!, endDate: Date!): [SupplierPerformanceReportRow!]!
    inventoryTurnoverSeries(period: String!, startDate: Date!, endDate: Date!): [InventoryTurnoverPoint!]!
    recipeProfitabilityReport: [RecipeProfitabilityRow!]!
    crossPanelLinks(itemIds: [ID!]): [CrossPanelLink!]!
    indexedMenus(restaurantGuid: String!): JSON
    menuVisibility(restaurantGuid: String!): MenuVisibility!
    menuMappings(restaurantGuid: String!, toastItemGuid: String): [MenuMapping!]!
    menuItemCost(restaurantGuid: String!, toastItemGuid: String!): Float!
    menuItemCapacity(restaurantGuid: String!, toastItemGuid: String!, quantity: Float, modifierOptionGuid: String): MenuItemCapacity!
    orderTrackingStatus(restaurantGuid: String!): OrderTrackingStatus!
    menuItemStock(restaurantGuid: String!, guids: [String!], multiLocationIds: [String!]): [MenuItemStock!]!
    rosterConfigurations: [RosterConfiguration!]!
    rosterConfiguration(name: String!): RosterConfiguration
    activeRosterConfiguration: RosterConfiguration
    savedRosters(startDate: Date!, endDate: Date!): [SavedRoster!]!
    savedRoster(id: ID!): SavedRoster
    rosterCandidates(includeToastOnly: Boolean, onlySevenShiftsActive: Boolean): [RosterCandidate!]!
    roleMappings: [RoleMapping!]!
    aiInsights(module: String, forDate: Date, status: String): [AIInsight!]!
    invoices(status: String, search: String, pagination: PaginationInput): PaginatedInvoices!
    invoice(id: ID!): Invoice
  }

  type Mutation {
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    deleteUser(id: ID!): Boolean!

    createTeamMember(input: CreateTeamMemberInput!): TeamMember!
    updateTeamMember(id: ID!, input: UpdateTeamMemberInput!): TeamMember!
    deleteTeamMember(id: ID!): Boolean!

    createShift(input: ShiftInput!): Shift!
    updateShift(id: ID!, input: ShiftInput!): Shift!
    deleteShift(id: ID!): Boolean!

    createInventoryItem(input: InventoryItemInput!): InventoryItem!
    updateInventoryItem(id: ID!, input: InventoryItemInput!): InventoryItem!
    deleteInventoryItem(id: ID!): Boolean!
    updateStock(id: ID!, quantity: Float!): InventoryItem!
    recordInventoryTransaction(itemId: ID!, quantity: Float!, unitCost: Float!, transactionType: String!, reason: String, referenceType: String, referenceId: ID, referenceNumber: String): InventoryTransaction!
    recordInventoryWaste(itemId: ID!, quantity: Float!, reason: String!, label: String, notes: String, unitCost: Float, recordedAt: Date): InventoryItem!

    createSupplier(name: String!, companyName: String!, type: String!, categories: [String!], preferred: Boolean, notes: String): Supplier!
    updateSupplier(id: ID!, type: String, categories: [String!], status: String, preferred: Boolean, notes: String): Supplier!

    createPurchaseOrder(supplierId: ID!, items: [PurchaseOrderItemInput!]!, notes: String, expectedDeliveryDate: Date): PurchaseOrder!
    updatePurchaseOrderStatus(id: ID!, status: String!, receivedDate: Date): PurchaseOrder!
    updatePurchaseOrder(id: ID!, input: UpdatePurchaseOrderInput!): PurchaseOrder!
    receivePurchaseOrder(id: ID!, receipts: [ReceiveItemInput!]!): ReceivePurchaseOrderResult!
    resetPurchaseOrder(id: ID!): PurchaseOrder!
    deletePurchaseOrder(id: ID!): Boolean!

    createServicePackage(input: ServicePackageInput!): ServicePackage!
    updateServicePackage(id: ID!, input: ServicePackageInput!): ServicePackage!
    deleteServicePackage(id: ID!): Boolean!

    createServiceLaneTicket(input: ServiceLaneTicketInput!): ServiceLaneTicket!
    updateServiceLaneTicket(id: ID!, input: ServiceLaneTicketInput!): ServiceLaneTicket!
    updateServiceLaneTicketStatus(id: ID!, status: String!, bayId: ID, primaryTechnician: ID): ServiceLaneTicket!

    createAutomationAsset(name: String!, type: String!, zone: String, assignedBay: ID, status: String, manufacturer: String, modelNumber: String): AutomationAsset!
    updateAutomationAsset(id: ID!, status: String, utilizationRate: Float, firmwareVersion: String, nextServiceDate: Date, notes: String): AutomationAsset!

    createInvoice(input: InvoiceInput!): Invoice!
    updateInvoice(id: ID!, input: InvoiceInput!): Invoice!
    addInvoicePayment(input: InvoicePaymentInput!): Invoice!
    updateInvoiceStatus(id: ID!, status: String!): Invoice!
    deleteInvoice(id: ID!): Boolean!
    markInvoicePaid(id: ID!): Invoice!
  
    createVendor(input: CreateVendorInput!): Supplier!
    updateVendor(id: ID!, input: UpdateVendorInput!): Supplier!
    deleteVendor(id: ID!): Boolean!
    updateVendorRepresentative(id: ID!, input: UpdateVendorRepresentativeInput!): Supplier!

    createRosterConfiguration(input: CreateRosterInput!): RosterConfiguration!
    updateRosterConfiguration(id: ID!, input: UpdateRosterInput!): RosterConfiguration!
    deleteRosterConfiguration(id: ID!): Boolean!
    setActiveRosterConfiguration(id: ID!): RosterConfiguration!
    updateRoleMapping(id: ID!, input: RoleMappingInput!): RoleMapping!
    saveRoster(input: SaveRosterInput!): SavedRoster!
    updateSavedRoster(id: ID!, input: SaveRosterInput!): SavedRoster!
    deleteSavedRoster(id: ID!): Boolean!

    indexMenus(restaurantGuid: String!): Boolean!
    setMenuVisibility(restaurantGuid: String!, hiddenMenus: [String!], hiddenGroups: [String!]): MenuVisibility!
    upsertMenuMapping(input: UpsertMenuMappingInput!): MenuMapping!
    generateRecipeDraft(restaurantGuid: String!, toastItemGuid: String!, priceyness: Float, cuisinePreset: String, atmospherePreset: String): String!
    setOrderTracking(restaurantGuid: String!, enabled: Boolean!): OrderTrackingStatus!
    runOrderTracking(restaurantGuid: String!, businessDate: String): Boolean!
    updateMenuItemStock(restaurantGuid: String!, updates: [MenuItemStockUpdateInput!]!): [MenuItemStock!]!

    syncFromToast: Boolean!
    generateInsights(module: String!, forDate: Date): Boolean!
    dismissInsight(id: ID!): Boolean!
  }

  type Subscription {
    shiftUpdated: ServiceLaneTicket
    inventoryUpdated: InventoryItem
    newInvoice: Invoice
    teamMemberUpdated: TeamMember
  }

  type SupplierPerformanceReportRow {
    supplierId: ID!
    supplierName: String!
    totalOrders: Int!
    totalSpent: Float!
    averageOrderValue: Float!
    onTimeDeliveryRate: Float!
    qualityRating: Float!
  }

  type InventoryTurnoverPoint {
    date: String!
    period: String!
    usageCost: Float!
    avgInventoryValue: Float!
    turnover: Float!
  }

  input CreateTeamMemberInput {
    name: String!
    email: String!
    phone: String
    role: String!
    department: String!
    status: String
    joinDate: Date
    hourlyRate: Float
    availability: String
    skills: [String!]
  }

  input UpdateTeamMemberInput {
    name: String
    email: String
    phone: String
    role: String
    department: String
    status: String
    hourlyRate: Float
    availability: String
    skills: [String!]
  }

  input CreateVendorInput {
    name: String!
    companyName: String!
    supplierCode: String
    type: String!
    categories: [String!]
    status: String
    isPreferred: Boolean
    notes: String
  }

  input UpdateVendorInput {
    name: String
    companyName: String
    supplierCode: String
    type: String
    categories: [String!]
    status: String
    isPreferred: Boolean
    notes: String
  }

  input UpdateVendorRepresentativeInput {
    name: String
    email: String
    phone: String
  }

  input UpdatePurchaseOrderInput {
    status: String
    expectedDeliveryDate: Date
    notes: String
  }

  input ReceiveItemInput {
    inventoryItem: ID!
    name: String
    quantityReceived: Float!
    credit: Float
  }

  type ReceivePurchaseOrderResult {
    order: PurchaseOrder
    missing: [MissingItem!]
    totalCredit: Float!
    replacementOrder: PurchaseOrder
  }

  type MissingItem {
    name: String!
    missingQuantity: Float!
    unitCost: Float!
    totalCredit: Float!
  }

  input CreateRosterInput {
    name: String!
    description: String
    isActive: Boolean
  }

  input UpdateRosterInput {
    name: String
    description: String
    isActive: Boolean
  }

  input RoleMappingInput {
    sevenShiftsRoleName: String
    standardRoleName: String
    department: String
    stratum: String
  }

  input SaveRosterInput {
    name: String!
    rosterDate: Date!
    shift: String
    notes: String
    nodes: [RosterNodeInput!]
  }

  input RosterNodeInput {
    id: ID!
    name: String
    department: String
    stratum: String
    capacity: Int
  }

  input UpsertMenuMappingInput {
    restaurantGuid: String!
    toastItemGuid: String!
    toastItemName: String
    components: [MenuMappingComponentInput!]
  }

  input MenuMappingComponentInput {
    kind: String!
    inventoryItem: ID
    nestedToastItemGuid: String
    quantity: Float
    unit: String
    notes: String
  }

  input MenuItemStockUpdateInput {
    guid: String
    multiLocationId: String
    status: String!
    quantity: Float
    versionId: String
  }

  type RecipeProfitabilityRow {
    recipeId: ID!
    name: String!
    foodCost: Float!
    menuPrice: Float!
    foodCostPct: Float!
    grossMargin: Float!
    isPopular: Boolean!
  }

  type CrossPanelLink {
    itemId: ID!
    itemName: String!
    vendorNames: [String!]!
    recipeNames: [String!]!
  }

  type MenuVisibility {
    restaurantGuid: String!
    hiddenMenus: [String!]!
    hiddenGroups: [String!]!
    updatedAt: Date
  }

  type MenuMappingComponent {
    kind: String!
    inventoryItem: ID
    nestedToastItemGuid: String
    quantity: Float
    unit: String
    notes: String
  }

  type MenuMapping {
    id: ID!
    restaurantGuid: String!
    toastItemGuid: String!
    toastItemName: String
    components: [MenuMappingComponent!]
    computedCostCache: Float
    lastComputedAt: Date
  }

  type MenuItemCapacityRequirement {
    inventoryItem: ID!
    unit: String!
    quantityPerOrder: Float!
    available: Float!
  }

  type MenuItemCapacity {
    capacity: Float!
    allHaveStock: Boolean!
    requirements: [MenuItemCapacityRequirement!]!
  }

  type OrderTrackingStatus {
    restaurantGuid: String!
    enabled: Boolean!
    lastRunAt: Date
    lastBusinessDate: String
  }

  type MenuItemStock {
    guid: String
    multiLocationId: String
    status: String
    quantity: Float
    versionId: String
  }

  type IndexedMenus {
    modifierGroupReferences: [JSON]
    modifierOptionReferences: [JSON]
  }

  # Roster and Scheduling
  type RosterConfiguration {
    id: ID!
    name: String!
    description: String
    isActive: Boolean!
    createdAt: Date
    updatedAt: Date
    nodes: [RosterNode!]
  }

  type RosterNode {
    id: ID!
    name: String
    department: String
    stratum: String
    capacity: Int
    assigned: [RosterAssignment!]
  }

  type RosterAssignment {
    userId: ID
    source: String
    displayName: String
    rating: Float
  }

  type RosterCandidate {
    id: ID!
    name: String
    email: String
    role: String
    roles: [String!]
    department: String
    stratum: String
    toastEnrolled: Boolean
    sevenShiftsEnrolled: Boolean
    rating: Float
  }

  type RoleMapping {
    id: ID!
    sevenShiftsRoleName: String
    standardRoleName: String
    department: String
    stratum: String
  }

  type SavedRoster {
    id: ID!
    name: String!
    rosterDate: Date!
    shift: String
    notes: String
    nodes: [RosterNode!]
  }

  type AIInsight {
    id: ID!
    module: String!
    title: String
    description: String
    action: String
    urgency: String
    impact: String
    status: String
    createdAt: Date
  }

  input PurchaseOrderItemInput {
    inventoryItem: ID!
    quantityOrdered: Float!
    unit: String!
    unitCost: Float!
    notes: String
  }
`;
























