import { addDays } from "date-fns";

interface DemoTeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
  joinDate: Date;
  toastId: string;
  hourlyRate: number;
  availability: string;
  skills: string[];
  performance: {
    rating: number;
    completedShifts: number;
    onTimeRate: number;
    comebacks: number;
    upsellCaptureRate: number;
    aseCertifications: string[];
  };
}

interface DemoShift {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  role: string;
  assignedTo: DemoTeamMember;
  status: string;
  breakTime: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DemoSupplier {
  id: string;
  name: string;
  companyName: string;
  type: string;
  categories: string[];
  status: string;
  contacts: Array<{ name: string; title: string; email: string; phone: string }>;
  address: { street: string; city: string; state: string; zipCode: string; country: string };
  paymentTerms: { terms: string; creditLimit: number; currentBalance: number; currency: string };
  logistics: { deliveryDays: string[]; deliveryWindow?: string; leadTimeDays?: number };
  performanceMetrics: {
    totalOrders: number;
    totalSpend: number;
    averageLeadTimeDays: number;
    onTimeDeliveryRate: number;
    fillRate: number;
    qualityScore: number;
    warrantyClaims: number;
    lastEvaluation: Date;
  };
  preferred: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DemoInventoryItem {
  id: string;
  name: string;
  category: string;
  segment?: string;
  partNumber: string;
  unit: string;
  currentStock: number;
  minThreshold: number;
  parLevel?: number;
  restockPeriod?: string;
  restockDays?: number;
  reorderPoint: number;
  reorderQuantity: number;
  safetyStock: number;
  maxCapacity: number;
  costPerUnit: number;
  status: string;
  totalValue: number;
  supplierId: string;
  supplierName: string;
  supplier: DemoSupplier;
  preferredSupplier?: string;
  vendorSku?: string;
  alternateSuppliers?: Array<{ name?: string; contact?: string; phone?: string; sku?: string; price?: number; leadTimeDays?: number }>;
  contractPricingTier?: string;
  universalFit: boolean;
  vehicleSystems: string[];
  storageLocation?: { aisle?: string; shelf?: string; bin?: string };
  compatibility?: Array<{ make: string; models: string[]; years: number[] }>;
  msrp?: number;
  leadTimeDays?: number;
  averageMonthlyUsage?: number;
  averageDailyUsage?: number;
  minimumOrderQuantity?: number;
  palletQuantity?: number;
  lastStockedDate?: Date;
  lastIssuedDate?: Date;
  wasteCategory?: string;
  waste?: number;
  wasteNotes?: string;
  wasteLogs?: DemoWasteLog[];
  images: string[];
  documents: Array<{ name: string; url: string; type: string; uploadedAt: Date }>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DemoWasteLog {
  id: string;
  date: Date;
  quantity: number;
  unitCost: number;
  label?: string;
  reason: string;
  notes?: string;
  recordedById?: string;
  recordedByName?: string;
}

interface DemoPerformanceEntry {
  id: string;
  teamMemberId: string;
  rating?: number;
  isFlag: boolean;
  flagType?: string;
  details?: string;
  salesGenerated?: number;
  date: Date;
}

interface DemoPurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplier: DemoSupplier;
  status: string;
  orderDate: Date;
  expectedDeliveryDate?: Date;
  items: Array<{
    inventoryItem: DemoInventoryItem;
    name: string;
    partNumber?: string;
    quantityOrdered: number;
    quantityReceived: number;
    unit: string;
    unitCost: number;
    totalCost: number;
    backorderedQuantity: number;
  }>;
  subtotal: number;
  tax: number;
  freight: number;
  miscFees: number;
  total: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DemoTransaction {
  id: string;
  inventoryItem: DemoInventoryItem;
  transactionType: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: Date;
  notes?: string;
}

interface DemoInvoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  status: string;
  issuedDate: Date;
  dueDate: Date;
  amount: number;
  laborTotal: number;
  partsTotal: number;
  tax: number;
  shopSupplies: number;
  hazmatFee: number;
  discounts: number;
  totalAmount: number;
  balanceDue: number;
  notes?: string;
  vehicle: { vin: string; year: number; make: string; model: string; mileageIn: number; mileageOut: number };
  advisor: { id: string; name: string };
  laborLines: Array<{ description: string; hours: number; rate: number; total: number; technician: { id: string; name: string } }>;
  partsLines: Array<{ description: string; quantity: number; unitPrice: number; total: number; taxable: boolean; inventoryItem?: { id: string; name: string; partNumber: string } }>;
  payments: Array<{ amount: number; method: string; receivedBy: string; date: Date }>;
  followUpReminders: Array<{ description: string; dueDate: Date }>;
}


interface DemoRecommendedPart {
  id: string;
  quantity: number;
  unit: string;
  note?: string;
  part: DemoInventoryItem;
}

interface DemoServicePackage {
  id: string;
  serviceCode: string;
  name: string;
  shortName?: string;
  category: string;
  subcategory?: string;
  description?: string;
  detailedSteps: string[];
  laborHours: number;
  basePrice: number;
  bayType: string;
  skillLevel: string;
  warrantyMonths?: number;
  serviceIntervalMiles?: number;
  serviceIntervalMonths?: number;
  recommendedParts: DemoRecommendedPart[];
  requiredEquipment: string[];
  upsellRecommendations: string[];
  inspectionChecklist: string[];
  safetyNotes?: string;
  sameDayEligible: boolean;
  isSeasonal: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface DemoServiceLaneTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerContactPhone?: string;
  customerContactEmail?: string;
  prefersText: boolean;
  vehicle: {
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    mileageIn?: number;
    mileageOut?: number;
    licensePlate?: string;
    color?: string;
    fuelType?: string;
    drivetrain?: string;
  };
  services: DemoTicketService[];
  advisor?: DemoTeamMember;
  primaryTechnician?: DemoTeamMember;
  bay?: DemoServiceBay;
  status: string;
  dropoffTime?: Date;
  promisedTime?: Date;
  actualStartTime?: Date;
  actualCompletionTime?: Date;
  nextFollowUpDate?: Date;
  recommendedFollowUps: string[];
  notes: DemoTicketNote[];
  createdAt: Date;
  updatedAt: Date;
}

interface DemoServiceBay {
  id: string;
  label: string;
  type: string;
  status: string;
  capacity: number;
  queueDepth: number;
  features: string[];
  assignedTechnician?: DemoTeamMember;
  currentTicket?: DemoServiceLaneTicket | null;
  lastInspection?: Date;
  nextMaintenance?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DemoTicketService {
  id: string;
  servicePackage: DemoServicePackage;
  status: string;
  estimatedHours?: number;
  actualHours?: number;
  estimatedPrice?: number;
  approved: boolean;
  technicianNotes?: string;
}

interface DemoTicketNote {
  id: string;
  timestamp: Date;
  author?: string;
  message: string;
  kind: string;
}

interface DemoAutomationTelemetryPoint {
  timestamp: Date;
  metric: string;
  value: number;
  unit?: string;
}

interface DemoAutomationAlert {
  id: string;
  level: string;
  message: string;
  createdAt: Date;
}

interface DemoAutomationAsset {
  id: string;
  assetTag?: string;
  name: string;
  type: string;
  manufacturer?: string;
  modelNumber?: string;
  status: string;
  firmwareVersion?: string;
  healthScore: number;
  utilizationRate: number;
  zone?: string;
  locationDescription?: string;
  assignedBay?: DemoServiceBay;
  connectedDevices: number;
  telemetry: DemoAutomationTelemetryPoint[];
  lastHeartbeat?: Date;
  lastServiceDate?: Date;
  nextServiceDate?: Date;
  serviceIntervalDays?: number;
  safetyAlerts: DemoAutomationAlert[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DemoAnalyticsSlice {
  category: string;
  value: number;
  change?: number;
}

interface DemoBayPerformance {
  bay?: DemoServiceBay;
  utilization?: number;
  throughput?: number;
  averageCycleTimeMinutes?: number;
}

interface DemoTechnicianMetric {
  technician?: DemoTeamMember;
  hoursFlagged?: number;
  billedHours?: number;
  efficiency?: number;
  comebacks?: number;
  upsellRate?: number;
}

interface DemoAnalyticsAlert {
  severity: string;
  title: string;
  message: string;
  suggestedAction?: string;
}

interface DemoShopAnalytics {
  period: string;
  date: Date;
  totalRevenue: number;
  laborRevenue: number;
  partsRevenue: number;
  grossProfit: number;
  vehiclesServiced: number;
  averageRepairOrder: number;
  bayUtilization: number;
  technicianEfficiency: number;
  diagnosticCaptureRate: number;
  partsTurnoverDays: number;
  comebackRate: number;
  customerSatisfaction: number;
  firstTimeFixRate: number;
  openEstimates: number;
  warrantyClaims: number;
  topServiceCategories: DemoAnalyticsSlice[];
  fleetVsRetailMix: DemoAnalyticsSlice[];
  revenueTrend: Array<{ timestamp: Date; label?: string; value: number }>;
  bayPerformance: DemoBayPerformance[];
  technicianLeaderboard: DemoTechnicianMetric[];
  alerts: DemoAnalyticsAlert[];
}

const now = new Date("2025-03-01T14:00:00Z");
const teamMembers: DemoTeamMember[] = [
  {
    id: "tm-avery",
    name: "Avery Chen",
    email: "avery.chen@ledgerone.auto",
    role: "Lead Technician",
    department: "Service Bays",
    status: "active",
    joinDate: new Date("2022-02-10T14:15:00Z"),
    toastId: "toast-avery-001",
    hourlyRate: 37,
    availability: "Full-time",
    skills: ["Hybrid powertrains", "Brake systems", "Advanced diagnostics"],
    performance: {
      rating: 4.8,
      completedShifts: 210,
      onTimeRate: 98,
      comebacks: 1,
      upsellCaptureRate: 41,
      aseCertifications: ["ASE L1", "ASE A5", "EV Safety"],
    },
  },
  {
    id: "tm-jordan",
    name: "Jordan Patel",
    email: "jordan.patel@ledgerone.auto",
    role: "Service Advisor",
    department: "Front Desk",
    status: "active",
    joinDate: new Date("2023-05-08T13:00:00Z"),
    toastId: "toast-jordan-002",
    hourlyRate: 25,
    availability: "Full-time",
    skills: ["Customer communication", "Digital inspections", "Repair financing"],
    performance: {
      rating: 4.7,
      completedShifts: 168,
      onTimeRate: 96,
      comebacks: 0,
      upsellCaptureRate: 49,
      aseCertifications: ["ASE C1"],
    },
  },
  {
    id: "tm-maria",
    name: "Maria Gomez",
    email: "maria.gomez@ledgerone.auto",
    role: "Parts Manager",
    department: "Parts",
    status: "active",
    joinDate: new Date("2021-09-18T16:45:00Z"),
    toastId: "toast-maria-003",
    hourlyRate: 28,
    availability: "Full-time",
    skills: ["Inventory control", "Supplier negotiations", "Warranty processing"],
    performance: {
      rating: 4.9,
      completedShifts: 238,
      onTimeRate: 99,
      comebacks: 0,
      upsellCaptureRate: 35,
      aseCertifications: ["ASE P2"],
    },
  },
];

const teamMemberById = new Map(teamMembers.map((member) => [member.id, member]));

function mapDemoWasteLogs(
  logs?: Array<{
    id?: string;
    date?: string | Date;
    quantity?: number;
    unitCost?: number;
    label?: string;
    reason?: string;
    notes?: string;
    recordedById?: string;
    recordedByName?: string;
  }>,
) {
  if (!Array.isArray(logs)) return [] as DemoWasteLog[];
  return logs
    .filter((entry) => entry && typeof entry.quantity !== "undefined")
    .map((entry, index) => ({
      id: entry.id ?? `waste-${Date.now()}-${index}`,
      date: entry.date ? new Date(entry.date) : new Date(),
      quantity: Number(entry.quantity ?? 0),
      unitCost: Number(entry.unitCost ?? 0),
      label: entry.label,
      reason: entry.reason ?? "General waste",
      notes: entry.notes,
      recordedById: entry.recordedById ?? "demo-user",
      recordedByName: entry.recordedByName ?? "Demo User",
    }));
}

const performanceEntries: DemoPerformanceEntry[] = [
  {
    id: "perf-avery-01",
    teamMemberId: "tm-avery",
    rating: 4.9,
    isFlag: false,
    salesGenerated: 1280,
    date: addDays(now, -2),
  },
  {
    id: "perf-avery-flag",
    teamMemberId: "tm-avery",
    isFlag: true,
    flagType: "yellow",
    details: "Stretched completion due to parts delay, communicated proactively",
    date: addDays(now, -6),
  },
  {
    id: "perf-jordan-01",
    teamMemberId: "tm-jordan",
    rating: 4.6,
    isFlag: false,
    salesGenerated: 940,
    date: addDays(now, -1),
  },
  {
    id: "perf-jordan-flag",
    teamMemberId: "tm-jordan",
    isFlag: true,
    flagType: "red",
    details: "Escalated customer complaint on 2/24",
    date: addDays(now, -5),
  },
  {
    id: "perf-maria-01",
    teamMemberId: "tm-maria",
    rating: 4.95,
    isFlag: false,
    salesGenerated: 1560,
    date: addDays(now, -3),
  },
  {
    id: "perf-maria-blue",
    teamMemberId: "tm-maria",
    isFlag: true,
    flagType: "blue",
    details: "Recovered lost part within 15 minutes, prevented bay downtime",
    date: addDays(now, -4),
  },
];

function buildTeamPerformance(memberId?: string, limit?: number, flagsOnly?: boolean) {
  const limitCount = Math.max(1, Math.min(limit ?? 8, 50));
  const filteredMembers = memberId ? teamMembers.filter((member) => member.id === memberId) : teamMembers;
  return filteredMembers.map((member) => {
    const entries = performanceEntries
      .filter((entry) => entry.teamMemberId === member.id)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const flags = entries.filter((entry) => entry.isFlag);
    const ratingEntries = entries.filter((entry) => !entry.isFlag && entry.rating != null);
    const average = ratingEntries.length
      ? ratingEntries.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / ratingEntries.length
      : member.performance?.rating ?? 0;
    const recentEntries = (flagsOnly ? flags : entries).slice(0, limitCount).map((entry) => ({
      id: entry.id,
      teamMemberId: member.id,
      rating: entry.rating ?? null,
      isFlag: entry.isFlag,
      flagType: entry.flagType ?? null,
      details: entry.details ?? null,
      salesGenerated: entry.salesGenerated ?? null,
      date: entry.date,
    }));
    const redFlags = flags.filter((entry) => (entry.flagType ?? "").toLowerCase() === "red").length;
    const yellowFlags = flags.filter((entry) => (entry.flagType ?? "").toLowerCase() === "yellow").length;
    const blueFlags = flags.filter((entry) => (entry.flagType ?? "").toLowerCase() === "blue").length;
    return {
      teamMember: member,
      averageRating: Number(average.toFixed(2)),
      completedShifts: member.performance?.completedShifts ?? 0,
      redFlags,
      yellowFlags,
      blueFlags,
      totalFlags: flags.length,
      recentEntries,
    };
  });
}

const shifts: DemoShift[] = [
  {
    id: "shift-01",
    date: addDays(now, 0),
    startTime: "08:00",
    endTime: "16:30",
    role: "Lead Technician",
    assignedTo: teamMemberById.get("tm-avery")!,
    status: "scheduled",
    breakTime: 30,
    notes: "EV battery thermal retrofit in bay 3",
    createdAt: addDays(now, -6),
    updatedAt: addDays(now, -1),
  },
  {
    id: "shift-02",
    date: addDays(now, 1),
    startTime: "09:00",
    endTime: "17:00",
    role: "Service Advisor",
    assignedTo: teamMemberById.get("tm-jordan")!,
    status: "scheduled",
    breakTime: 45,
    notes: "Fleet check-ins and follow-ups",
    createdAt: addDays(now, -5),
    updatedAt: addDays(now, -2),
  },
  {
    id: "shift-03",
    date: addDays(now, 2),
    startTime: "07:30",
    endTime: "16:00",
    role: "Parts Manager",
    assignedTo: teamMemberById.get("tm-maria")!,
    status: "scheduled",
    breakTime: 30,
    notes: "Cycle count for braking zone",
    createdAt: addDays(now, -4),
    updatedAt: addDays(now, -1),
  },
];

const suppliers: DemoSupplier[] = [
  {
    id: "sup-harbor",
    name: "Harbor Parts Distribution",
    companyName: "Harbor Parts Distribution",
    type: "OEM",
    categories: ["Braking", "Suspension"],
    status: "active",
    contacts: [
      {
        name: "Lena Ortiz",
        title: "Account Manager",
        email: "lena@harborparts.com",
        phone: "(555) 013-8800",
      },
    ],
    address: {
      street: "150 Harbor Industrial Way",
      city: "Atlanta",
      state: "GA",
      zipCode: "30318",
      country: "US",
    },
    paymentTerms: {
      terms: "Net 30",
      creditLimit: 50000,
      currentBalance: 16200,
      currency: "USD",
    },
    logistics: {
      deliveryDays: ["Monday", "Thursday"],
      deliveryWindow: "09:00-12:00",
      leadTimeDays: 2,
    },
    performanceMetrics: {
      totalOrders: 182,
      totalSpend: 312500,
      averageLeadTimeDays: 1.8,
      onTimeDeliveryRate: 96,
      fillRate: 92,
      qualityScore: 4.7,
      warrantyClaims: 3,
      lastEvaluation: addDays(now, -21),
    },
    preferred: true,
    notes: "Primary OEM chassis supplier.",
    createdAt: new Date("2021-08-15T05:00:00Z"),
    updatedAt: addDays(now, -7),
  },
  {
    id: "sup-rapidflow",
    name: "RapidFlow Lubricants",
    companyName: "RapidFlow Lubricants Co.",
    type: "Fluids & Chemicals",
    categories: ["Fluids", "Shop Supplies"],
    status: "active",
    contacts: [
      {
        name: "Devon Greene",
        title: "Technical Rep",
        email: "devon.greene@rapidflow.com",
        phone: "(555) 014-1100",
      },
    ],
    address: {
      street: "980 Petroleum Parkway",
      city: "Birmingham",
      state: "AL",
      zipCode: "35203",
      country: "US",
    },
    paymentTerms: {
      terms: "Net 45",
      creditLimit: 25000,
      currentBalance: 6400,
      currency: "USD",
    },
    logistics: {
      deliveryDays: ["Tuesday", "Friday"],
      deliveryWindow: "10:00-14:00",
      leadTimeDays: 3,
    },
    performanceMetrics: {
      totalOrders: 118,
      totalSpend: 88500,
      averageLeadTimeDays: 3.2,
      onTimeDeliveryRate: 94,
      fillRate: 97,
      qualityScore: 4.5,
      warrantyClaims: 0,
      lastEvaluation: addDays(now, -18),
    },
    preferred: false,
    notes: "Maintains synthetic oil drums and DEF tanks.",
    createdAt: new Date("2021-05-10T05:00:00Z"),
    updatedAt: addDays(now, -9),
  },
];

const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
function computeInventoryStatus(currentStock: number, minThreshold: number, safetyStock: number): string {
  if (currentStock <= 0) return "out";
  if (currentStock <= Math.min(minThreshold, safetyStock)) return "critical";
  if (currentStock <= minThreshold) return "low";
  return "in_stock";
}

const inventoryItems: DemoInventoryItem[] = [
  {
    id: "inv-brake-pad",
    name: "Ceramic Brake Pad Kit",
    category: "Braking",
    segment: "OEM",
    partNumber: "BP-4201C",
    unit: "set",
    currentStock: 18,
    minThreshold: 12,
    parLevel: 20,
    restockPeriod: "weekly",
    restockDays: 7,
    reorderPoint: 15,
    reorderQuantity: 24,
    safetyStock: 10,
    maxCapacity: 60,
    costPerUnit: 58,
    status: "in_stock",
    totalValue: 0,
    supplierId: "sup-harbor",
    supplierName: "Harbor Parts Distribution",
    supplier: supplierById.get("sup-harbor")!,
    preferredSupplier: "Harbor Parts Distribution",
    vendorSku: "HPD-BP-4201C",
    alternateSuppliers: [
      { name: "Performance Parts Central", sku: "PPC-BP-4201C", price: 61, leadTimeDays: 4 },
      { name: "FleetStop USA", sku: "FS-4201C", price: 56, leadTimeDays: 6 },
    ],
    contractPricingTier: "Platinum",
    universalFit: false,
    vehicleSystems: ["Braking"],
    storageLocation: { aisle: "A", shelf: "3", bin: "B12" },
    compatibility: [
      {
        make: "Toyota",
        models: ["Camry", "Avalon"],
        years: [2018, 2019, 2020, 2021],
      },
    ],
    msrp: 126,
    leadTimeDays: 2,
    averageMonthlyUsage: 30,
    averageDailyUsage: 1,
    minimumOrderQuantity: 8,
    palletQuantity: 96,
    lastStockedDate: addDays(now, -4),
    lastIssuedDate: addDays(now, -1),
    wasteCategory: "Contamination",
    waste: 2,
    wasteNotes: "One set compromised in bay spill; another damaged backing plate",
    wasteLogs: [
      {
        id: "waste-brake-1",
        date: addDays(now, -2),
        quantity: 1,
        unitCost: 58,
        label: "Contamination",
        reason: "Hydraulic fluid spill in storage bin",
        notes: "Removed complete kit for safety compliance",
        recordedById: "demo-user",
        recordedByName: "Avery Chen",
      },
      {
        id: "waste-brake-2",
        date: addDays(now, -1),
        quantity: 1,
        unitCost: 58,
        label: "Return damage",
        reason: "Customer return with bent shim",
        notes: "Tagged for vendor claim",
        recordedById: "demo-user",
        recordedByName: "Jordan Patel",
      },
    ],
    images: ["https://cdn.ledgerone.auto/inventory/brake-kit.jpg"],
    documents: [
      {
        name: "Torque Spec",
        url: "https://cdn.ledgerone.auto/docs/brake-kit-spec.pdf",
        type: "spec",
        uploadedAt: addDays(now, -60),
      },
    ],
    notes: "Pair with rotor kit RT-8842 for premium packages.",
    createdAt: new Date("2022-04-11T05:00:00Z"),
    updatedAt: addDays(now, -1),
  },
  {
    id: "inv-synthetic-oil",
    name: "Full Synthetic 5W-30 Drum",
    category: "Fluids",
    segment: "OE Equivalent",
    partNumber: "OIL-5W30-DR",
    unit: "gallon",
    currentStock: 95,
    minThreshold: 80,
    reorderPoint: 90,
    reorderQuantity: 120,
    safetyStock: 70,
    maxCapacity: 200,
    costPerUnit: 9.8,
    status: "in_stock",
    totalValue: 0,
    supplierId: "sup-rapidflow",
    supplierName: "RapidFlow Lubricants",
    supplier: supplierById.get("sup-rapidflow")!,
    universalFit: true,
    vehicleSystems: ["Powertrain"],
    storageLocation: { aisle: "Bulk", shelf: "Tank", bin: "TK-02" },
    msrp: 21,
    leadTimeDays: 3,
    averageMonthlyUsage: 92,
    lastStockedDate: addDays(now, -7),
    lastIssuedDate: addDays(now, -2),
    images: ["https://cdn.ledgerone.auto/inventory/synthetic-oil.jpg"],
    documents: [
      {
        name: "SDS",
        url: "https://cdn.ledgerone.auto/docs/synthetic-oil-sds.pdf",
        type: "safety",
        uploadedAt: addDays(now, -90),
      },
    ],
    createdAt: new Date("2021-12-01T05:00:00Z"),
    updatedAt: addDays(now, -2),
  },
  {
    id: "inv-ev-scanner",
    name: "EV Diagnostic Scanner",
    category: "Diagnostics",
    segment: "Performance",
    partNumber: "SCAN-EVX1",
    unit: "unit",
    currentStock: 4,
    minThreshold: 3,
    reorderPoint: 3,
    reorderQuantity: 2,
    safetyStock: 2,
    maxCapacity: 10,
    costPerUnit: 2860,
    status: "in_stock",
    totalValue: 0,
    supplierId: "sup-harbor",
    supplierName: "Harbor Parts Distribution",
    supplier: supplierById.get("sup-harbor")!,
    universalFit: true,
    vehicleSystems: ["Electrical"],
    storageLocation: { aisle: "Tool Crib", shelf: "Upper", bin: "TC-7" },
    msrp: 3995,
    leadTimeDays: 5,
    averageMonthlyUsage: 2,
    lastStockedDate: addDays(now, -30),
    lastIssuedDate: addDays(now, -6),
    images: ["https://cdn.ledgerone.auto/inventory/ev-scanner.jpg"],
    documents: [],
    notes: "Allocate one unit to mobile diagnostics van when available.",
    createdAt: new Date("2023-03-14T05:00:00Z"),
    updatedAt: addDays(now, -6),
  },
];

for (const item of inventoryItems) {
  const supplier = supplierById.get(item.supplierId);
  if (supplier) {
    item.supplierName = supplier.name;
  }
  item.status = computeInventoryStatus(item.currentStock, item.minThreshold, item.safetyStock);
  item.totalValue = Number((item.currentStock * item.costPerUnit).toFixed(2));
}

const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));


const servicePackages: DemoServicePackage[] = [
  {
    id: "svc-hybrid-diagnostic",
    serviceCode: "A-SVC-3001",
    name: "Advanced Hybrid Diagnostic & Thermal Management",
    shortName: "Hybrid Diagnostic",
    category: "Powertrain",
    subcategory: "Hybrid Systems",
    description:
      "Comprehensive diagnostics for hybrid and EV powertrains with thermal analysis and customer-ready repair planning.",
    detailedSteps: [
      "Run full system scan and collect hybrid diagnostic codes",
      "Capture thermal profile of battery modules and cooling loops",
      "Balance check and insulation resistance test",
      "Generate prioritized repair plan with estimated labor and parts",
    ],
    laborHours: 3.5,
    basePrice: 645,
    bayType: "Diagnostic",
    skillLevel: "Master Technician",
    warrantyMonths: 12,
    serviceIntervalMiles: 12000,
    serviceIntervalMonths: 12,
    recommendedParts: [
      {
        id: "rec-hybrid-kit",
        quantity: 1,
        unit: "kit",
        note: "Includes HV coolant bleed kit and gasket set",
        part: inventoryById.get("inv-ev-scanner") ?? inventoryItems[2],
      },
    ],
    requiredEquipment: ["High-voltage safety kit", "Thermal imaging camera"],
    upsellRecommendations: ["HV coolant exchange", "Battery conditioning"],
    inspectionChecklist: ["HV isolation verification", "Battery module delta", "Cooling pump duty cycle"],
    safetyNotes: "Follow high-voltage lockout procedures before connecting diagnostics.",
    sameDayEligible: true,
    isSeasonal: false,
    isFeatured: true,
    createdAt: addDays(now, -120),
    updatedAt: addDays(now, -2),
  },
  {
    id: "svc-ceramic-brake-refresh",
    serviceCode: "A-SVC-2104",
    name: "Ceramic Brake Refresh & Road Force Balance",
    shortName: "Ceramic Brake Refresh",
    category: "Braking",
    subcategory: "Performance",
    description:
      "Premium brake pad replacement with rotor machining, road force balance, and post-service verification.",
    detailedSteps: [
      "Inspect braking system and measure rotors",
      "Machine or replace rotors based on specification",
      "Install ceramic pad kit and torque hardware",
      "Road force balance wheels and perform test drive",
    ],
    laborHours: 2.9,
    basePrice: 520,
    bayType: "General",
    skillLevel: "Senior Technician",
    warrantyMonths: 24,
    serviceIntervalMiles: 25000,
    serviceIntervalMonths: 24,
    recommendedParts: [
      {
        id: "rec-ceramic-pad-kit",
        quantity: 1,
        unit: "set",
        note: "Pair with rotor resurfacing pack when scoring above spec.",
        part: inventoryById.get("inv-brake-pad") ?? inventoryItems[0],
      },
    ],
    requiredEquipment: ["Two-post lift", "Brake lathe"],
    upsellRecommendations: ["Stainless brake lines", "Brake fluid flush"],
    inspectionChecklist: ["Rotor runout", "Pad bedding completion", "Brake pedal feel"],
    safetyNotes: "Confirm rotor cooling before torque verification.",
    sameDayEligible: true,
    isSeasonal: false,
    isFeatured: false,
    createdAt: addDays(now, -180),
    updatedAt: addDays(now, -4),
  },
  {
    id: "svc-express-oil-fleet",
    serviceCode: "A-SVC-1010",
    name: "Express Fleet Oil & Filter Service",
    shortName: "Fleet Oil Service",
    category: "Maintenance",
    subcategory: "Express",
    description:
      "High-throughput oil and filter service tailored for fleet vehicles with digital inspection capture.",
    detailedSteps: [
      "Drain oil and capture sample for analysis",
      "Replace oil filter and torque drain plug",
      "Fill with OE-spec synthetic oil and reset monitors",
      "Perform 30-point digital inspection with annotated photos",
    ],
    laborHours: 1.1,
    basePrice: 165,
    bayType: "Express",
    skillLevel: "General Technician",
    warrantyMonths: 6,
    serviceIntervalMiles: 6000,
    serviceIntervalMonths: 6,
    recommendedParts: [
      {
        id: "rec-synthetic-drum",
        quantity: 5,
        unit: "gallon",
        note: "Bulk synthetic oil for 3/4-ton fleet trucks.",
        part: inventoryById.get("inv-synthetic-oil") ?? inventoryItems[1],
      },
    ],
    requiredEquipment: ["Quick-lube pit", "Digital inspection tablet"],
    upsellRecommendations: ["Fuel system detergent", "Cabin air filter replacement"],
    inspectionChecklist: ["Fluid leak check", "Battery test", "TPMS reset"],
    safetyNotes: "Verify fleet torque spec sheet before final torque.",
    sameDayEligible: true,
    isSeasonal: false,
    isFeatured: true,
    createdAt: addDays(now, -200),
    updatedAt: addDays(now, -6),
  },
];
const servicePackageById = new Map(servicePackages.map((pkg) => [pkg.id, pkg]));

const serviceBays: DemoServiceBay[] = [
  {
    id: "bay-a1",
    label: "Bay A1",
    type: "General",
    status: "occupied",
    capacity: 1,
    queueDepth: 0,
    features: ["Two-post lift", "Brake lathe"],
    assignedTechnician: teamMemberById.get("tm-avery") ?? undefined,
    currentTicket: null,
    lastInspection: addDays(now, -12),
    nextMaintenance: addDays(now, 18),
    notes: "Primary bay for braking and suspension work.",
    createdAt: addDays(now, -240),
    updatedAt: addDays(now, -1),
  },
  {
    id: "bay-b2",
    label: "Bay B2",
    type: "Diagnostic",
    status: "available",
    capacity: 1,
    queueDepth: 0,
    features: ["EV isolation station", "ADAS calibration rig"],
    assignedTechnician: teamMemberById.get("tm-avery") ?? undefined,
    currentTicket: null,
    lastInspection: addDays(now, -9),
    nextMaintenance: addDays(now, 21),
    notes: "Equipped for HV diagnostics and ADAS calibration.",
    createdAt: addDays(now, -200),
    updatedAt: addDays(now, -2),
  },
  {
    id: "bay-ev1",
    label: "Bay EV-1",
    type: "EV Specialized",
    status: "available",
    capacity: 1,
    queueDepth: 0,
    features: ["High-voltage platform", "Battery lift"],
    assignedTechnician: teamMemberById.get("tm-avery") ?? undefined,
    currentTicket: null,
    lastInspection: addDays(now, -14),
    nextMaintenance: addDays(now, 30),
    notes: "Reserved for EV and hybrid battery service.",
    createdAt: addDays(now, -210),
    updatedAt: addDays(now, -3),
  },
  {
    id: "bay-express",
    label: "Bay Express",
    type: "Express",
    status: "reserved",
    capacity: 2,
    queueDepth: 0,
    features: ["Quick-lube pit", "Fleet telematics uplink"],
    assignedTechnician: teamMemberById.get("tm-maria") ?? undefined,
    currentTicket: null,
    lastInspection: addDays(now, -10),
    nextMaintenance: addDays(now, 12),
    notes: "Dedicated to fleet express services.",
    createdAt: addDays(now, -180),
    updatedAt: addDays(now, -2),
  },
];
const serviceBayById = new Map(serviceBays.map((bay) => [bay.id, bay]));

const serviceLaneTickets: DemoServiceLaneTicket[] = [
  {
    id: "ticket-ro-84521",
    ticketNumber: "RO-84521",
    customerName: "Taylor Jennings",
    customerContactPhone: "+1-470-555-2201",
    customerContactEmail: "taylor.jennings@example.com",
    prefersText: true,
    vehicle: {
      vin: "5NMS3CADXLH015847",
      year: 2020,
      make: "Hyundai",
      model: "Santa Fe",
      mileageIn: 45210,
    },
    services: [
      {
        id: "ticket-ro-84521-1",
        servicePackage: servicePackageById.get("svc-hybrid-diagnostic") ?? servicePackages[0],
        status: "diagnosing",
        estimatedHours: 3.5,
        estimatedPrice: 645,
        approved: true,
      },
      {
        id: "ticket-ro-84521-2",
        servicePackage: servicePackageById.get("svc-ceramic-brake-refresh") ?? servicePackages[1],
        status: "waiting_parts",
        estimatedHours: 2.1,
        estimatedPrice: 495,
        approved: true,
      },
    ],
    advisor: teamMemberById.get("tm-jordan") ?? undefined,
    primaryTechnician: teamMemberById.get("tm-avery") ?? undefined,
    bay: serviceBayById.get("bay-b2") ?? undefined,
    status: "waiting_parts",
    dropoffTime: addDays(now, -1),
    promisedTime: addDays(now, 1),
    actualStartTime: addDays(now, -1),
    actualCompletionTime: undefined,
    nextFollowUpDate: addDays(now, 7),
    recommendedFollowUps: ["Battery reconditioning in 6 months"],
    notes: [
      {
        id: "note-ro-84521-1",
        timestamp: addDays(now, -1),
        author: "Jordan Patel",
        message: "Customer approved HV battery module replacement.",
        kind: "advisor",
      },
    ],
    createdAt: addDays(now, -1),
    updatedAt: new Date(),
  },
  {
    id: "ticket-ro-84522",
    ticketNumber: "RO-84522",
    customerName: "Zen Fleet Services",
    customerContactPhone: "+1-470-555-2202",
    customerContactEmail: "maintenance@zenfleet.demo",
    prefersText: false,
    vehicle: {
      vin: "1FT8W3BT6MEC21045",
      year: 2019,
      make: "Ford",
      model: "F-350",
      mileageIn: 92800,
    },
    services: [
      {
        id: "ticket-ro-84522-1",
        servicePackage: servicePackageById.get("svc-express-oil-fleet") ?? servicePackages[2],
        status: "in_service",
        estimatedHours: 1.2,
        estimatedPrice: 185,
        approved: true,
      },
    ],
    advisor: teamMemberById.get("tm-jordan") ?? undefined,
    primaryTechnician: teamMemberById.get("tm-maria") ?? undefined,
    bay: serviceBayById.get("bay-express") ?? undefined,
    status: "in_service",
    dropoffTime: new Date(),
    promisedTime: new Date(),
    actualStartTime: addDays(now, -0.2),
    actualCompletionTime: undefined,
    nextFollowUpDate: addDays(now, 30),
    recommendedFollowUps: ["Schedule fleet brake inspection"],
    notes: [
      {
        id: "note-ro-84522-1",
        timestamp: new Date(),
        author: "Maria Gomez",
        message: "Fleet telematics flag requires oil analysis sample.",
        kind: "technician",
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "ticket-ro-84523",
    ticketNumber: "RO-84523",
    customerName: "Vanessa Liu",
    customerContactPhone: "+1-470-555-2203",
    customerContactEmail: "vanessa.liu@example.com",
    prefersText: true,
    vehicle: {
      vin: "JTDKN3DU2A1234567",
      year: 2017,
      make: "Toyota",
      model: "Prius",
      mileageIn: 121500,
      mileageOut: 121560,
    },
    services: [
      {
        id: "ticket-ro-84523-1",
        servicePackage: servicePackageById.get("svc-hybrid-diagnostic") ?? servicePackages[0],
        status: "completed",
        estimatedHours: 3,
        estimatedPrice: 389,
        approved: true,
      },
    ],
    advisor: teamMemberById.get("tm-jordan") ?? undefined,
    primaryTechnician: teamMemberById.get("tm-avery") ?? undefined,
    bay: serviceBayById.get("bay-a1") ?? undefined,
    status: "ready_for_pickup",
    dropoffTime: addDays(now, -2),
    promisedTime: addDays(now, 0),
    actualStartTime: addDays(now, -1.5),
    actualCompletionTime: addDays(now, -0.3),
    nextFollowUpDate: addDays(now, 60),
    recommendedFollowUps: ["Hybrid cooling service in 90 days"],
    notes: [
      {
        id: "note-ro-84523-1",
        timestamp: addDays(now, -0.4),
        author: "Avery Chen",
        message: "Battery cooling bleed complete. Vehicle test driven.",
        kind: "technician",
      },
    ],
    createdAt: addDays(now, -2),
    updatedAt: addDays(now, -0.3),
  },
];
const serviceLaneTicketById = new Map(serviceLaneTickets.map((ticket) => [ticket.id, ticket]));

const automationAssets: DemoAutomationAsset[] = [
  {
    id: "asset-atlas-cart",
    assetTag: "AUTO-ATC-500",
    name: "Atlas Autonomous Tool Cart #1",
    type: "Autonomous Tool Cart",
    manufacturer: "Atlas Robotics",
    modelNumber: "ATC-500",
    status: "online",
    firmwareVersion: "v5.3.1",
    healthScore: 91,
    utilizationRate: 82,
    zone: "Service Core",
    locationDescription: "Between bays A1 and B2",
    assignedBay: serviceBayById.get("bay-a1") ?? undefined,
    connectedDevices: 4,
    telemetry: [
      { timestamp: addDays(now, -1), metric: "utilization", value: 78, unit: "%" },
      { timestamp: new Date(), metric: "utilization", value: 84, unit: "%" },
      { timestamp: new Date(), metric: "task_count", value: 12 },
    ],
    lastHeartbeat: new Date(),
    lastServiceDate: addDays(now, -25),
    nextServiceDate: addDays(now, 5),
    serviceIntervalDays: 30,
    safetyAlerts: [],
    notes: "Handles staging of torque wrenches and specialty sockets.",
    createdAt: addDays(now, -210),
    updatedAt: addDays(now, -1),
  },
  {
    id: "asset-bolt-charger",
    assetTag: "AUTO-BOLT-180",
    name: "Bolt EV Charger 180kW",
    type: "EV Charger",
    manufacturer: "BoltGrid",
    modelNumber: "BoltGrid-180",
    status: "maintenance",
    firmwareVersion: "v3.8.4",
    healthScore: 76,
    utilizationRate: 64,
    zone: "EV Pod",
    locationDescription: "Adjacent to Bay EV-1",
    assignedBay: serviceBayById.get("bay-ev1") ?? undefined,
    connectedDevices: 1,
    telemetry: [
      { timestamp: addDays(now, -2), metric: "charge_sessions", value: 6 },
      { timestamp: addDays(now, -1), metric: "uptime", value: 92, unit: "%" },
    ],
    lastHeartbeat: new Date(),
    lastServiceDate: addDays(now, -90),
    nextServiceDate: addDays(now, 3),
    serviceIntervalDays: 45,
    safetyAlerts: [
      { id: "alert-bolt-1", level: "warning", message: "Contact resistance trending high", createdAt: addDays(now, -1) },
    ],
    notes: "Awaiting replacement contactor assembly.",
    createdAt: addDays(now, -250),
    updatedAt: addDays(now, -1),
  },
  {
    id: "asset-skyeye-drone",
    assetTag: "AUTO-SE-149",
    name: "SkyEye Inspection Drone",
    type: "Shop Drone",
    manufacturer: "SkyEye Robotics",
    modelNumber: "SE-149",
    status: "online",
    firmwareVersion: "v1.4.9",
    healthScore: 88,
    utilizationRate: 54,
    zone: "Shop Ceiling Grid",
    locationDescription: "Ceiling rail above service core",
    assignedBay: undefined,
    connectedDevices: 2,
    telemetry: [
      { timestamp: addDays(now, -1), metric: "inspection_runs", value: 4 },
      { timestamp: new Date(), metric: "battery_health", value: 94, unit: "%" },
    ],
    lastHeartbeat: new Date(),
    lastServiceDate: addDays(now, -10),
    nextServiceDate: addDays(now, 20),
    serviceIntervalDays: 60,
    safetyAlerts: [],
    notes: "Automated bay auditing for safety compliance.",
    createdAt: addDays(now, -150),
    updatedAt: addDays(now, -2),
  },
];
const automationAssetById = new Map(automationAssets.map((asset) => [asset.id, asset]));

const shopAnalyticsSeries: DemoShopAnalytics[] = (() => {
  const days = 14;
  const series: DemoShopAnalytics[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(now, -i);
    const baseRevenue = 19800 + i * 120 - (i % 3) * 360;
    const laborRevenue = Number((baseRevenue * 0.62).toFixed(2));
    const partsRevenue = Number((baseRevenue * 0.38).toFixed(2));
    const vehiclesServiced = 26 + ((i + 2) % 5);
    const grossProfit = Number((baseRevenue * 0.46).toFixed(2));
    const averageRepairOrder = vehiclesServiced ? Number((baseRevenue / vehiclesServiced).toFixed(2)) : 0;
    const bayUtilization = Number((70 + ((i + 1) % 6) * 3).toFixed(2));
    const technicianEfficiency = Number((86 + ((i + 3) % 5) * 1.8).toFixed(2));
    const diagnosticCaptureRate = Number((74 + ((i + 4) % 6) * 1.1).toFixed(2));
    const partsTurnoverDays = Number((32 - ((i + 1) % 4) * 0.8).toFixed(2));
    const comebackRate = Number((1.9 + ((i + 2) % 3) * 0.15).toFixed(2));
    const customerSatisfaction = Number((4.6 - ((i + 1) % 4) * 0.03).toFixed(2));
    const firstTimeFixRate = Number((91 - ((i + 3) % 4) * 0.4).toFixed(2));
    const openEstimates = 8 + ((i + 2) % 5);
    const warrantyClaims = 2 + ((i + 3) % 3);

    const topServiceCategories: DemoAnalyticsSlice[] = [
      { category: "Diagnostics", value: Number((laborRevenue * 0.32).toFixed(2)), change: 2.1 },
      { category: "Fleet Maintenance", value: Number((laborRevenue * 0.27).toFixed(2)), change: -1.4 },
      { category: "Braking", value: Number((laborRevenue * 0.18).toFixed(2)), change: 0.6 },
    ];
    const fleetVsRetailMix: DemoAnalyticsSlice[] = [
      { category: "Retail", value: Number((baseRevenue * 0.58).toFixed(2)), change: 1.2 },
      { category: "Fleet", value: Number((baseRevenue * 0.42).toFixed(2)), change: -0.8 },
    ];
    const revenueTrend = [
      { timestamp: new Date(date.getTime() + 8 * 60 * 60 * 1000), label: "08:00", value: Number((baseRevenue * 0.18).toFixed(2)) },
      { timestamp: new Date(date.getTime() + 12 * 60 * 60 * 1000), label: "12:00", value: Number((baseRevenue * 0.33).toFixed(2)) },
      { timestamp: new Date(date.getTime() + 16 * 60 * 60 * 1000), label: "16:00", value: Number((baseRevenue * 0.29).toFixed(2)) },
      { timestamp: new Date(date.getTime() + 19 * 60 * 60 * 1000), label: "19:00", value: Number((baseRevenue * 0.2).toFixed(2)) },
    ];
    const bayPerformance: DemoBayPerformance[] = [
      {
        bay: serviceBayById.get("bay-a1") ?? undefined,
        utilization: Math.min(98, bayUtilization + 6),
        throughput: 7 + ((i + 1) % 3),
        averageCycleTimeMinutes: 94 - ((i + 2) % 4) * 3,
      },
      {
        bay: serviceBayById.get("bay-b2") ?? undefined,
        utilization: Math.max(55, bayUtilization - 12),
        throughput: 5 + (i % 2),
        averageCycleTimeMinutes: 86 - ((i + 3) % 5) * 2,
      },
      {
        bay: serviceBayById.get("bay-ev1") ?? undefined,
        utilization: Math.min(92, bayUtilization - 4),
        throughput: 4 + ((i + 2) % 3),
        averageCycleTimeMinutes: 128 - ((i + 4) % 3) * 6,
      },
    ];
    const technicianLeaderboard: DemoTechnicianMetric[] = [
      { technician: teamMemberById.get("tm-avery") ?? undefined, hoursFlagged: 9.5, billedHours: 8.8, efficiency: 92, comebacks: 0, upsellRate: 43 },
      { technician: teamMemberById.get("tm-jordan") ?? undefined, hoursFlagged: 6.1, billedHours: 6, efficiency: 88, comebacks: 1, upsellRate: 48 },
      { technician: teamMemberById.get("tm-maria") ?? undefined, hoursFlagged: 5.4, billedHours: 5.2, efficiency: 96, comebacks: 0, upsellRate: 39 },
    ];
    const alerts: DemoAnalyticsAlert[] =
      i === 0
        ? [
          {
            severity: "warning",
            title: "Fleet throughput slipping",
            message: "Fleet work is trending 6% below goal for the last three days.",
            suggestedAction: "Review bay allocation and confirm fleet appointments.",
          },
          {
            severity: "critical",
            title: "Parts turnover slowing",
            message: "Average parts turnover increased to 32 days. Investigate braking SKUs.",
            suggestedAction: "Audit braking inventory and coordinate with suppliers.",
          },
        ]
        : [];

    series.push({
      period: "daily",
      date,
      totalRevenue: Number(baseRevenue.toFixed(2)),
      laborRevenue,
      partsRevenue,
      grossProfit,
      vehiclesServiced,
      averageRepairOrder,
      bayUtilization,
      technicianEfficiency,
      diagnosticCaptureRate,
      partsTurnoverDays,
      comebackRate,
      customerSatisfaction,
      firstTimeFixRate,
      openEstimates,
      warrantyClaims,
      topServiceCategories,
      fleetVsRetailMix,
      revenueTrend,
      bayPerformance,
      technicianLeaderboard,
      alerts,
    });
  }
  return series;
})();

function syncServiceBayAssignments() {
  for (const bay of serviceBays) {
    bay.currentTicket = null;
    bay.queueDepth = 0;
  }
  for (const ticket of serviceLaneTickets) {
    if (!ticket.bay) continue;
    const bay = serviceBayById.get(ticket.bay.id) ?? ticket.bay;
    if (!bay) continue;
    if (ticket.status !== "completed" && ticket.status !== "ready_for_pickup") {
      bay.queueDepth += 1;
      if (!bay.currentTicket) {
        bay.currentTicket = ticket;
      }
    }
  }
}

syncServiceBayAssignments();

function ensureTeamMember(id?: string) {
  return id ? teamMemberById.get(id) ?? null : null;
}

function ensureServicePackage(id?: string) {
  return id ? servicePackageById.get(id) ?? null : null;
}

function ensureServiceBay(id?: string) {
  return id ? serviceBayById.get(id) ?? null : null;
}

function mapRecommendedPartsInput(
  parts?: Array<{ id?: string; part: string; quantity?: number; unit?: string; note?: string }>,
): DemoRecommendedPart[] {
  if (!Array.isArray(parts)) return [];
  return parts
    .map((entry, index) => {
      const item = inventoryById.get(entry.part);
      if (!item) return null;
      return {
        id: entry.id ?? `rec-${Date.now()}-${index}`,
        quantity: typeof entry.quantity === "number" ? entry.quantity : 1,
        unit: entry.unit ?? item.unit ?? "each",
        note: entry.note,
        part: item,
      } as any;
    })
    .filter((entry): entry is DemoRecommendedPart => Boolean(entry));
}

function mapTicketServicesInput(
  services?: Array<{
    id?: string;
    servicePackage: string;
    status?: string;
    estimatedHours?: number;
    estimatedPrice?: number;
    approved?: boolean;
    technicianNotes?: string;
  }>,
): DemoTicketService[] {
  if (!Array.isArray(services)) return [];
  return services
    .map((entry, index) => {
      const pkg = ensureServicePackage(entry.servicePackage);
      if (!pkg) return null;
      return {
        id: entry.id ?? `ticket-service-${Date.now()}-${index}`,
        servicePackage: pkg,
        status: entry.status ?? "scheduled",
        estimatedHours: typeof entry.estimatedHours === "number" ? entry.estimatedHours : undefined,
        actualHours: undefined,
        estimatedPrice: typeof entry.estimatedPrice === "number" ? entry.estimatedPrice : undefined,
        approved: entry.approved ?? true,
        technicianNotes: entry.technicianNotes,
      } as any;
    })
    .filter((entry): entry is DemoTicketService => Boolean(entry));
}

function mapTicketNotesInput(
  notes?: Array<{ id?: string; timestamp?: string | Date; author?: string; message: string; kind?: string }>,
): DemoTicketNote[] {
  if (!Array.isArray(notes)) return [];
  return notes
    .map((entry, index) => ({
      id: entry.id ?? `ticket-note-${Date.now()}-${index}`,
      timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
      author: entry.author,
      message: entry.message,
      kind: entry.kind ?? "advisor",
    }))
    .filter((entry) => Boolean(entry.message));
}

function filterServicePackages(category?: string, search?: string) {
  let list = [...servicePackages];
  if (category) {
    const normalized = category.toLowerCase();
    list = list.filter((pkg) => pkg.category.toLowerCase() === normalized);
  }
  if (search) {
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((pkg) =>
        [pkg.name, pkg.serviceCode, pkg.shortName ?? "", pkg.category, pkg.subcategory ?? ""]
          .some((value) => value.toLowerCase().includes(term)),
      );
    }
  }
  return list;
}

function filterServiceBays(includeOutOfService?: boolean) {
  syncServiceBayAssignments();
  if (includeOutOfService) return serviceBays;
  return serviceBays.filter((bay) => bay.status !== "out_of_service");
}

function filterServiceLaneTickets(status?: string) {
  syncServiceBayAssignments();
  let list = [...serviceLaneTickets];
  if (status) {
    const normalized = status.toLowerCase();
    list = list.filter((ticket) => (ticket.status ?? "").toLowerCase() === normalized);
  }
  return list.sort((a, b) => {
    const aTime = a.dropoffTime ? a.dropoffTime.getTime() : 0;
    const bTime = b.dropoffTime ? b.dropoffTime.getTime() : 0;
    return bTime - aTime;
  });
}

function filterShopAnalytics(period: string, startDate?: string, endDate?: string) {
  const normalized = (period ?? "daily").toLowerCase();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  return shopAnalyticsSeries.filter((entry) => {
    if (entry.period.toLowerCase() !== normalized) return false;
    if (start && entry.date < start) return false;
    if (end && entry.date > end) return false;
    return true;
  });
}


const purchaseOrders: DemoPurchaseOrder[] = [
  {
    id: "po-1001",
    poNumber: "PO-2025-0001",
    supplierId: "sup-harbor",
    supplierName: "Harbor Parts Distribution",
    supplier: supplierById.get("sup-harbor")!,
    status: "receiving",
    orderDate: addDays(now, -5),
    expectedDeliveryDate: addDays(now, 0),
    items: [
      {
        inventoryItem: inventoryById.get("inv-brake-pad")!,
        name: "Ceramic Brake Pad Kit",
        partNumber: "BP-4201C",
        quantityOrdered: 30,
        quantityReceived: 18,
        unit: "set",
        unitCost: 58,
        totalCost: 1740,
        backorderedQuantity: 4,
      },
      {
        inventoryItem: inventoryById.get("inv-ev-scanner")!,
        name: "EV Diagnostic Scanner",
        partNumber: "SCAN-EVX1",
        quantityOrdered: 1,
        quantityReceived: 0,
        unit: "unit",
        unitCost: 2860,
        totalCost: 2860,
        backorderedQuantity: 0,
      },
    ],
    subtotal: 4600,
    tax: 322,
    freight: 95,
    miscFees: 0,
    total: 5017,
    notes: "Prioritize brake kits for fleet contracts.",
    createdAt: addDays(now, -5),
    updatedAt: addDays(now, -1),
  },
  {
    id: "po-1002",
    poNumber: "PO-2025-0002",
    supplierId: "sup-rapidflow",
    supplierName: "RapidFlow Lubricants",
    supplier: supplierById.get("sup-rapidflow")!,
    status: "confirmed",
    orderDate: addDays(now, -8),
    expectedDeliveryDate: addDays(now, 1),
    items: [
      {
        inventoryItem: inventoryById.get("inv-synthetic-oil")!,
        name: "Full Synthetic 5W-30 Drum",
        partNumber: "OIL-5W30-DR",
        quantityOrdered: 140,
        quantityReceived: 0,
        unit: "gallon",
        unitCost: 9.8,
        totalCost: 1372,
        backorderedQuantity: 0,
      },
    ],
    subtotal: 1372,
    tax: 0,
    freight: 140,
    miscFees: 20,
    total: 1532,
    notes: "Refill bulk tanks and mobile totes.",
    createdAt: addDays(now, -8),
    updatedAt: addDays(now, -2),
  },
];

const transactions: DemoTransaction[] = [
  {
    id: "txn-001",
    inventoryItem: inventoryById.get("inv-brake-pad")!,
    transactionType: "issue_to_repair",
    quantity: 6,
    unitCost: 58,
    totalCost: 348,
    balanceBefore: 24,
    balanceAfter: 18,
    createdAt: addDays(now, -1),
    notes: "Repair order RO-11452 (fleet Camry)",
  },
  {
    id: "txn-002",
    inventoryItem: inventoryById.get("inv-synthetic-oil")!,
    transactionType: "purchase",
    quantity: 60,
    unitCost: 9.8,
    totalCost: 588,
    balanceBefore: 35,
    balanceAfter: 95,
    createdAt: addDays(now, -7),
    notes: "Restock from RapidFlow delivery",
  },
];

const invoices: DemoInvoice[] = [
  {
    id: "inv-001",
    invoiceNumber: "INV-2025-001",
    clientName: "NorthBridge Fleet Services",
    status: "open",
    issuedDate: addDays(now, -2),
    dueDate: addDays(now, 28),
    amount: 1320,
    laborTotal: 780,
    partsTotal: 420,
    tax: 92,
    shopSupplies: 26,
    hazmatFee: 12,
    discounts: -30,
    totalAmount: 1308,
    balanceDue: 1308,
    notes: "Quarterly EV service and ADAS calibration.",
    vehicle: {
      vin: "1HGCV1F35LA123456",
      year: 2021,
      make: "Honda",
      model: "Accord Hybrid",
      mileageIn: 48210,
      mileageOut: 48292,
    },
    advisor: { id: teamMembers[1].id, name: teamMembers[1].name },
    laborLines: [
      {
        description: "ADAS camera calibration",
        hours: 2.1,
        rate: 165,
        total: 346.5,
        technician: { id: teamMembers[0].id, name: teamMembers[0].name },
      },
      {
        description: "Hybrid cooling system bleed",
        hours: 1.6,
        rate: 145,
        total: 232,
        technician: { id: teamMembers[0].id, name: teamMembers[0].name },
      },
    ],
    partsLines: [
      {
        description: "Synthetic coolant",
        quantity: 2,
        unitPrice: 24,
        total: 48,
        taxable: true,
        inventoryItem: { id: "inv-synthetic-oil", name: "Full Synthetic 5W-30 Drum", partNumber: "OIL-5W30-DR" },
      },
      {
        description: "Cabin filter",
        quantity: 1,
        unitPrice: 32,
        total: 32,
        taxable: true,
      },
    ],
    payments: [],
    followUpReminders: [
      {
        description: "Schedule ADAS verification drive",
        dueDate: addDays(now, 30),
      },
    ],
  },
  {
    id: "inv-002",
    invoiceNumber: "INV-2025-002",
    clientName: "Maria Thompson",
    status: "paid",
    issuedDate: addDays(now, -6),
    dueDate: addDays(now, 24),
    amount: 860,
    laborTotal: 540,
    partsTotal: 220,
    tax: 68,
    shopSupplies: 18,
    hazmatFee: 8,
    discounts: 0,
    totalAmount: 896,
    balanceDue: 0,
    notes: "Brake refresh and rotor machining.",
    vehicle: {
      vin: "3FA6P0G73LR213987",
      year: 2020,
      make: "Ford",
      model: "Fusion",
      mileageIn: 61245,
      mileageOut: 61290,
    },
    advisor: { id: teamMembers[1].id, name: teamMembers[1].name },
    laborLines: [
      {
        description: "Brake pad replacement",
        hours: 1.4,
        rate: 150,
        total: 210,
        technician: { id: teamMembers[0].id, name: teamMembers[0].name },
      },
      {
        description: "Road force balance",
        hours: 1,
        rate: 145,
        total: 145,
        technician: { id: teamMembers[0].id, name: teamMembers[0].name },
      },
    ],
    partsLines: [
      {
        description: "Ceramic brake pad kit",
        quantity: 1,
        unitPrice: 126,
        total: 126,
        taxable: true,
        inventoryItem: { id: "inv-brake-pad", name: "Ceramic Brake Pad Kit", partNumber: "BP-4201C" },
      },
    ],
    payments: [
      {
        amount: 896,
        method: "credit_card",
        receivedBy: teamMembers[1].name,
        date: addDays(now, -4),
      },
    ],
    followUpReminders: [],
  },
];
function filterInventory(search?: string, category?: string) {
  let list = [...inventoryItems];
  if (search) {
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((item) =>
        [
          item.name,
          item.partNumber,
          item.category,
          item.segment ?? "",
          item.supplierName,
        ]
          .some((value) => value.toLowerCase().includes(term)),
      );
    }
  }
  if (category) {
    list = list.filter((item) => item.category.toLowerCase() === category.toLowerCase());
  }
  return list;
}

function buildInventorySummary() {
  const totalParts = inventoryItems.length;
  const totalInventoryValue = inventoryItems.reduce((sum, item) => sum + item.totalValue, 0);
  const criticalParts = inventoryItems.filter((item) => item.status === "critical").length;
  const lowStockParts = inventoryItems.filter((item) => item.status === "low").length;
  const specialOrderParts = inventoryItems.filter((item) => item.segment === "Performance").length;

  const categoryTotals = new Map<string, { value: number; quantity: number }>();
  let wasteQuantity = 0;
  let wasteCost = 0;
  for (const item of inventoryItems) {
    const current = categoryTotals.get(item.category) ?? { value: 0, quantity: 0 };
    current.value += item.totalValue;
    current.quantity += item.currentStock;
    categoryTotals.set(item.category, current);

    if (Array.isArray(item.wasteLogs) && item.wasteLogs.length) {
      for (const log of item.wasteLogs) {
        wasteQuantity += log.quantity;
        wasteCost += log.quantity * (log.unitCost ?? item.costPerUnit ?? 0);
      }
    } else if (item.waste) {
      wasteQuantity += item.waste;
      wasteCost += item.waste * (item.costPerUnit ?? 0);
    }
  }

  const topCategories = Array.from(categoryTotals.entries())
    .map(([category, stats]) => ({
      category,
      value: Number(stats.value.toFixed(2)),
      quantity: Number(stats.quantity.toFixed(2)),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    totalParts,
    totalInventoryValue: Number(totalInventoryValue.toFixed(2)),
    criticalParts,
    lowStockParts,
    specialOrderParts,
    totalWasteQuantity: Number(wasteQuantity.toFixed(2)),
    totalWasteCost: Number(wasteCost.toFixed(2)),
    topCategories,
  };
}

function buildWasteReport(startDate?: string, endDate?: string, supplierId?: string, category?: string) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const normalizedCategory = category?.toLowerCase();
  const entries: Array<{ id: string; item: DemoInventoryItem; quantity: number; unitCost: number; label?: string; reason: string; recordedAt: Date; recordedByName?: string }> = [];
  for (const item of inventoryItems) {
    if (supplierId && item.supplierId !== supplierId) continue;
    const logs = Array.isArray(item.wasteLogs) ? item.wasteLogs : [];
    for (const log of logs) {
      const recordedAt = log.date ? new Date(log.date) : new Date();
      if (start && recordedAt < start) continue;
      if (end && recordedAt > end) continue;
      if (normalizedCategory && log.label && log.label.toLowerCase() !== normalizedCategory) continue;
      entries.push({
        id: log.id ?? `${item.id}-waste-${recordedAt.getTime()}`,
        item,
        quantity: log.quantity,
        unitCost: log.unitCost ?? item.costPerUnit ?? 0,
        label: log.label ?? item.wasteCategory,
        reason: log.reason,
        recordedAt,
        recordedByName: log.recordedByName,
      });
    }
  }
  return entries
    .map((entry) => ({
      ...entry,
      totalCost: Number((entry.quantity * entry.unitCost).toFixed(2)),
    }))
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
    .slice(0, 200);
}

function buildSupplierPerformance(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const stats = new Map<string, {
    supplier: DemoSupplier;
    totalOrders: number;
    totalSpend: number;
    leadTimeDays: number;
    leadSamples: number;
    onTime: number;
    totalItemsOrdered: number;
    totalItemsReceived: number;
    wasteCost: number;
  }>();

  for (const order of purchaseOrders) {
    if (start && order.orderDate < start) continue;
    if (end && order.orderDate > end) continue;
    const supplier = order.supplier ?? supplierById.get(order.supplierId);
    if (!supplier) continue;
    const key = supplier.id;
    if (!stats.has(key)) {
      stats.set(key, {
        supplier,
        totalOrders: 0,
        totalSpend: 0,
        leadTimeDays: 0,
        leadSamples: 0,
        onTime: 0,
        totalItemsOrdered: 0,
        totalItemsReceived: 0,
        wasteCost: 0,
      });
    }
    const entry = stats.get(key)!;
    entry.totalOrders += 1;
    entry.totalSpend += order.total;
    if (order.expectedDeliveryDate) {
      const lead = (order.expectedDeliveryDate.getTime() - order.orderDate.getTime()) / (1000 * 60 * 60 * 24);
      entry.leadTimeDays += lead;
      entry.leadSamples += 1;
    }
    if (order.expectedDeliveryDate && order.updatedAt) {
      if (order.updatedAt.getTime() <= order.expectedDeliveryDate.getTime()) entry.onTime += 1;
    }
    for (const line of order.items) {
      entry.totalItemsOrdered += line.quantityOrdered;
      entry.totalItemsReceived += line.quantityReceived ?? 0;
    }
  }

  for (const item of inventoryItems) {
    if (!item.supplierId) continue;
    const entry = stats.get(item.supplierId);
    if (!entry) continue;
    const logs = Array.isArray(item.wasteLogs) ? item.wasteLogs : [];
    for (const log of logs) {
      const recordedAt = log.date ? new Date(log.date) : null;
      if (start && recordedAt && recordedAt < start) continue;
      if (end && recordedAt && recordedAt > end) continue;
      entry.wasteCost += log.quantity * (log.unitCost ?? item.costPerUnit ?? 0);
    }
  }

  return Array.from(stats.values())
    .map((entry) => {
      const avgLead = entry.leadSamples ? entry.leadTimeDays / entry.leadSamples : 0;
      const fill = entry.totalItemsOrdered ? entry.totalItemsReceived / entry.totalItemsOrdered : 0;
      const onTimeRate = entry.totalOrders ? entry.onTime / entry.totalOrders : 0;
      return {
        supplier: entry.supplier,
        totalOrders: entry.totalOrders,
        totalSpend: Number(entry.totalSpend.toFixed(2)),
        averageLeadTimeDays: Number(avgLead.toFixed(2)),
        fillRate: Number(fill.toFixed(3)),
        onTimeDeliveryRate: Number(onTimeRate.toFixed(3)),
        wasteCost: Number(entry.wasteCost.toFixed(2)),
      };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

function buildInventoryAlerts() {
  return inventoryItems
    .filter((item) => item.status === "low" || item.status === "critical")
    .map((item, index) => ({
      id: `alert-${index + 1}`,
      inventoryItem: item,
      condition: item.status === "critical" ? "Critical Stock" : "Low Stock",
      severity: item.status === "critical" ? "critical" : "warning",
      message:
        item.status === "critical"
          ? `${item.name} is at ${item.currentStock} ${item.unit}s; expedite reorder.`
          : `${item.name} is trending low with ${item.currentStock} ${item.unit}s remaining`,
    }));
}

function buildLowStock(limit?: number) {
  const filtered = inventoryItems
    .filter((item) => item.currentStock <= item.reorderPoint)
    .sort((a, b) => a.currentStock - b.currentStock);
  const slice = typeof limit === "number" ? filtered.slice(0, Math.max(limit, 0)) : filtered;
  return slice.map((item) => ({
    id: item.id,
    name: item.name,
    partNumber: item.partNumber,
    unit: item.unit,
    currentStock: item.currentStock,
    minThreshold: item.minThreshold,
    reorderPoint: item.reorderPoint,
    status: item.status,
    supplierName: item.supplierName,
  }));
}

function searchEntries(query: string, limit?: number) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const max = Math.max(1, Math.min(limit ?? 8, 20));

  const inventoryResults = inventoryItems
    .filter((item) =>
      [item.name, item.partNumber, item.supplierName, item.category].some((value) =>
        value.toLowerCase().includes(term),
      ),
    )
    .slice(0, Math.ceil(max / 3))
    .map((item, index) => ({
      id: `inventory-${item.id}`,
      kind: "inventory",
      title: item.name,
      description: `${item.partNumber} - ${item.category}`,
      route: `/dashboard/inventory?focus=${item.id}`,
      score: 0.9 - index * 0.05,
    }));

  const supplierResults = suppliers
    .filter((supplier) =>
      [supplier.name, supplier.companyName, supplier.type].some((value) =>
        value.toLowerCase().includes(term),
      ),
    )
    .slice(0, Math.ceil(max / 3))
    .map((supplier, index) => ({
      id: `supplier-${supplier.id}`,
      kind: "supplier",
      title: supplier.name,
      description: `${supplier.type} - ${supplier.categories.join(", ")}`,
      route: `/dashboard/inventory?supplier=${supplier.id}`,
      score: 0.85 - index * 0.05,
    }));

  const teamResults = teamMembers
    .filter((member) =>
      [member.name, member.role, member.department].some((value) =>
        value.toLowerCase().includes(term),
      ),
    )
    .slice(0, Math.ceil(max / 3))
    .map((member, index) => ({
      id: `team-${member.id}`,
      kind: "team",
      title: member.name,
      description: `${member.role} - ${member.department}`,
      route: `/dashboard/team?focus=${member.id}`,
      score: 0.8 - index * 0.05,
    }));

  return [...inventoryResults, ...supplierResults, ...teamResults].slice(0, max);
}

export const demoResolvers = {
  Query: {
    globalSearch: async (_: unknown, { query, limit }: { query: string; limit?: number }) =>
      searchEntries(query, limit),
    teamMembers: async () => teamMembers,
    shifts: async (
      _: unknown,
      { startDate, endDate }: { startDate?: string; endDate?: string },
    ) => {
      const start = startDate ? new Date(startDate) : addDays(now, -1);
      const end = endDate ? new Date(endDate) : addDays(now, 7);
      return shifts.filter((shift) => shift.date >= start && shift.date <= end);
    },
    shift: async (_: unknown, { id }: { id: string }) => {
      return shifts.find((shift) => shift.id === id) ?? null;
    },
    inventoryItems: async (
      _: unknown,
      { search, filterCategory, pagination }: { search?: string; filterCategory?: string; pagination?: { page?: number; pageSize?: number } },
    ) => {
      const filtered = filterInventory(search, filterCategory);
      const page = Math.max(1, pagination?.page ?? 1);
      const pageSize = Math.max(1, Math.min(pagination?.pageSize ?? 25, 100));
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const items = filtered.slice(start, end);
      return {
        totalCount: filtered.length,
        items,
        pageInfo: {
          page,
          pageSize,
          hasNextPage: end < filtered.length,
          hasPreviousPage: start > 0,
        },
      };
    },
    inventorySummary: async () => buildInventorySummary(),
    inventoryAlerts: async () => buildInventoryAlerts(),
    lowStockItems: async (_: unknown, { limit }: { limit?: number }) => buildLowStock(limit),
    suppliers: async () => suppliers,
    wasteReport: async (_: unknown, { startDate, endDate, supplierId, category }: { startDate?: string; endDate?: string; supplierId?: string; category?: string }) =>
      buildWasteReport(startDate, endDate, supplierId, category),
    supplierPerformance: async (_: unknown, { startDate, endDate }: { startDate?: string; endDate?: string }) =>
      buildSupplierPerformance(startDate, endDate),
    teamPerformance: async (_: unknown, { memberId, limit, flagsOnly }: { memberId?: string; limit?: number; flagsOnly?: boolean }) =>
      buildTeamPerformance(memberId, limit, flagsOnly),
    servicePackages: async (
      _: unknown,
      { category, search }: { category?: string; search?: string },
    ) => filterServicePackages(category, search),
    servicePackage: async (_: unknown, { id }: { id: string }) => servicePackageById.get(id) ?? null,
    featuredServicePackages: async () => servicePackages.filter((pkg) => pkg.isFeatured),
    serviceBays: async (_: unknown, { includeOutOfService }: { includeOutOfService?: boolean }) =>
      filterServiceBays(includeOutOfService),
    serviceLaneTickets: async (_: unknown, { status }: { status?: string }) => filterServiceLaneTickets(status),
    automationAssets: async () => automationAssets,
    shopAnalytics: async (
      _: unknown,
      { period, startDate, endDate }: { period: string; startDate?: string; endDate?: string },
    ) => filterShopAnalytics(period, startDate, endDate),
    purchaseOrders: async () =>
      purchaseOrders.map((order) => ({
        ...order,
        supplier: order.supplier ?? supplierById.get(order.supplierId)!,
      })),
    inventoryTransactions: async () => transactions,
    invoices: async (_: unknown, { status, search, pagination }: { status?: string; search?: string; pagination?: { page?: number; pageSize?: number } }) => {
      let list = [...invoices];
      if (status) {
        const normalized = status.toLowerCase();
        list = list.filter((invoice) => invoice.status.toLowerCase() === normalized);
      }
      if (search) {
        const term = search.trim().toLowerCase();
        if (term) {
          list = list.filter((invoice) => {
            return [
              invoice.invoiceNumber,
              invoice.clientName,
              invoice.vehicle?.vin ?? "",
              invoice.vehicle?.make ?? "",
              invoice.vehicle?.model ?? "",
            ].some((value) => value.toLowerCase().includes(term));
          });
        }
      }
      const page = Math.max(1, pagination?.page ?? 1);
      const pageSize = Math.max(1, Math.min(pagination?.pageSize ?? 25, 100));
      const start = (page - 1) * pageSize;
      const items = list.slice(start, start + pageSize);
      const totalCount = Array.isArray(list) ? list.length : 0;
      return {
        items,
        totalCount,
      };
    },
    invoice: async (_: unknown, { id }: { id: string }) => invoices.find((inv) => inv.id === id) ?? null,
  },
  Mutation: {
    createShift: async (
      _: unknown,
      {
        input,
      }: {
        input: { date?: string; startTime?: string; endTime?: string; role?: string; assignedTo: string; status?: string; notes?: string; breakTime?: number };
      },
    ) => {
      const assigned = teamMemberById.get(input.assignedTo);
      if (!assigned) throw new Error("Assigned team member not found in demo dataset");
      const shift: DemoShift = {
        id: `shift-${Date.now()}`,
        date: input.date ? new Date(input.date) : new Date(),
        startTime: input.startTime ?? "08:00",
        endTime: input.endTime ?? "16:00",
        role: input.role ?? assigned.role,
        assignedTo: assigned,
        status: input.status ?? "scheduled",
        breakTime: input.breakTime ?? 30,
        notes: input.notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      shifts.unshift(shift);
      return shift;
    },
    updateShift: async (
      _: unknown,
      { id, input }: { id: string; input: { date?: string; startTime?: string; endTime?: string; role?: string; assignedTo?: string; status?: string; notes?: string; breakTime?: number } },
    ) => {
      const shift = shifts.find((entry) => entry.id === id);
      if (!shift) throw new Error("Shift not found in demo dataset");
      if (input.date) shift.date = new Date(input.date);
      if (input.startTime) shift.startTime = input.startTime;
      if (input.endTime) shift.endTime = input.endTime;
      if (input.role) shift.role = input.role;
      if (input.assignedTo) {
        const assigned = teamMemberById.get(input.assignedTo);
        if (!assigned) throw new Error("Assigned team member not found in demo dataset");
        shift.assignedTo = assigned;
      }
      if (input.status) shift.status = input.status;
      if (input.notes !== undefined) shift.notes = input.notes;
      if (typeof input.breakTime === "number") shift.breakTime = input.breakTime;
      shift.updatedAt = new Date();
      return shift;
    },
    deleteShift: async (_: unknown, { id }: { id: string }) => {
      const index = shifts.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        shifts.splice(index, 1);
        return true;
      }
      return false;
    },

    createServiceLaneTicket: async (_: unknown, { input }: { input: any }) => {
      if (!input) throw new Error("Input is required");
      const ticket: DemoServiceLaneTicket = {
        id: `ticket-${Date.now()}`,
        ticketNumber: input.ticketNumber ?? `RO-${Date.now()}`,
        customerName: input.customerName ?? "Guest Customer",
        customerContactPhone: input.customerContactPhone ?? undefined,
        customerContactEmail: input.customerContactEmail ?? undefined,
        prefersText: Boolean(input.prefersText ?? false),
        vehicle: input.vehicle ? { ...input.vehicle } : {},
        services: mapTicketServicesInput(input.services),
        advisor: ensureTeamMember(input.advisor ?? undefined) ?? undefined,
        primaryTechnician: ensureTeamMember(input.primaryTechnician ?? undefined) ?? undefined,
        bay: ensureServiceBay(input.bay ?? undefined) ?? undefined,
        status: input.status ?? "awaiting_check_in",
        dropoffTime: input.dropoffTime ? new Date(input.dropoffTime) : new Date(),
        promisedTime: input.promisedTime ? new Date(input.promisedTime) : undefined,
        actualStartTime: input.actualStartTime ? new Date(input.actualStartTime) : undefined,
        actualCompletionTime: input.actualCompletionTime ? new Date(input.actualCompletionTime) : undefined,
        nextFollowUpDate: input.nextFollowUpDate ? new Date(input.nextFollowUpDate) : undefined,
        recommendedFollowUps: Array.isArray(input.recommendedFollowUps) ? [...input.recommendedFollowUps] : [],
        notes: mapTicketNotesInput(input.notes),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      serviceLaneTickets.unshift(ticket);
      serviceLaneTicketById.set(ticket.id, ticket);
      syncServiceBayAssignments();
      return ticket;
    },
    updateServiceLaneTicket: async (_: unknown, { id, input }: { id: string; input: any }) => {
      const ticket = serviceLaneTicketById.get(id);
      if (!ticket) throw new Error("Service lane ticket not found in demo dataset");
      if (input.ticketNumber) ticket.ticketNumber = input.ticketNumber;
      if (input.customerName) ticket.customerName = input.customerName;
      if (input.customerContactPhone !== undefined) ticket.customerContactPhone = input.customerContactPhone ?? undefined;
      if (input.customerContactEmail !== undefined) ticket.customerContactEmail = input.customerContactEmail ?? undefined;
      if (typeof input.prefersText === "boolean") ticket.prefersText = input.prefersText;
      if (input.vehicle) ticket.vehicle = { ...ticket.vehicle, ...input.vehicle };
      if (input.services) ticket.services = mapTicketServicesInput(input.services);
      if (input.advisor) ticket.advisor = ensureTeamMember(input.advisor) ?? ticket.advisor;
      if (input.primaryTechnician) ticket.primaryTechnician = ensureTeamMember(input.primaryTechnician) ?? ticket.primaryTechnician;
      if (input.bay) ticket.bay = ensureServiceBay(input.bay) ?? ticket.bay;
      if (input.status) ticket.status = input.status;
      if (input.dropoffTime) ticket.dropoffTime = new Date(input.dropoffTime);
      if (input.promisedTime) ticket.promisedTime = new Date(input.promisedTime);
      if (input.actualStartTime) ticket.actualStartTime = new Date(input.actualStartTime);
      if (input.actualCompletionTime) ticket.actualCompletionTime = new Date(input.actualCompletionTime);
      if (input.nextFollowUpDate) ticket.nextFollowUpDate = new Date(input.nextFollowUpDate);
      if (Array.isArray(input.recommendedFollowUps)) ticket.recommendedFollowUps = [...input.recommendedFollowUps];
      if (input.notes) ticket.notes = mapTicketNotesInput(input.notes);
      ticket.updatedAt = new Date();
      syncServiceBayAssignments();
      return ticket;
    },
    updateServiceLaneTicketStatus: async (
      _: unknown,
      { id, status, bayId, primaryTechnician }: { id: string; status: string; bayId?: string; primaryTechnician?: string },
    ) => {
      const ticket = serviceLaneTicketById.get(id);
      if (!ticket) throw new Error("Service lane ticket not found in demo dataset");
      ticket.status = status;
      if (bayId) ticket.bay = ensureServiceBay(bayId) ?? ticket.bay;
      if (primaryTechnician) ticket.primaryTechnician = ensureTeamMember(primaryTechnician) ?? ticket.primaryTechnician;
      if (status === "in_service" && !ticket.actualStartTime) {
        ticket.actualStartTime = new Date();
      }
      if (status === "completed" || status === "ready_for_pickup") {
        ticket.actualCompletionTime = new Date();
      }
      ticket.updatedAt = new Date();
      syncServiceBayAssignments();
      return ticket;
    },
    createServicePackage: async (_: unknown, { input }: { input: any }) => {
      if (!input?.name) throw new Error("Service package name is required");
      const pkg: DemoServicePackage = {
        id: `svc-${Date.now()}`,
        serviceCode: input.serviceCode ?? `SP-${Date.now()}`,
        name: input.name,
        shortName: input.shortName ?? undefined,
        category: input.category ?? "General",
        subcategory: input.subcategory ?? undefined,
        description: input.description ?? undefined,
        detailedSteps: Array.isArray(input.detailedSteps) ? [...input.detailedSteps] : [],
        laborHours: typeof input.laborHours === "number" ? input.laborHours : 1,
        basePrice: typeof input.basePrice === "number" ? input.basePrice : 0,
        bayType: input.bayType ?? "General",
        skillLevel: input.skillLevel ?? "Standard",
        warrantyMonths: input.warrantyMonths ?? undefined,
        serviceIntervalMiles: input.serviceIntervalMiles ?? undefined,
        serviceIntervalMonths: input.serviceIntervalMonths ?? undefined,
        recommendedParts: mapRecommendedPartsInput(input.recommendedParts),
        requiredEquipment: Array.isArray(input.requiredEquipment) ? [...input.requiredEquipment] : [],
        upsellRecommendations: Array.isArray(input.upsellRecommendations) ? [...input.upsellRecommendations] : [],
        inspectionChecklist: Array.isArray(input.inspectionChecklist) ? [...input.inspectionChecklist] : [],
        safetyNotes: input.safetyNotes ?? undefined,
        sameDayEligible: input.sameDayEligible ?? false,
        isSeasonal: input.isSeasonal ?? false,
        isFeatured: input.isFeatured ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      servicePackages.unshift(pkg);
      servicePackageById.set(pkg.id, pkg);
      return pkg;
    },
    updateServicePackage: async (_: unknown, { id, input }: { id: string; input: any }) => {
      const pkg = servicePackageById.get(id);
      if (!pkg) throw new Error("Service package not found in demo dataset");
      if (input.serviceCode) pkg.serviceCode = input.serviceCode;
      if (input.name) pkg.name = input.name;
      if (input.shortName !== undefined) pkg.shortName = input.shortName ?? undefined;
      if (input.category) pkg.category = input.category;
      if (input.subcategory !== undefined) pkg.subcategory = input.subcategory ?? undefined;
      if (input.description !== undefined) pkg.description = input.description ?? undefined;
      if (Array.isArray(input.detailedSteps)) pkg.detailedSteps = [...input.detailedSteps];
      if (typeof input.laborHours === "number") pkg.laborHours = input.laborHours;
      if (typeof input.basePrice === "number") pkg.basePrice = input.basePrice;
      if (input.bayType) pkg.bayType = input.bayType;
      if (input.skillLevel) pkg.skillLevel = input.skillLevel;
      if (input.warrantyMonths !== undefined) pkg.warrantyMonths = input.warrantyMonths;
      if (input.serviceIntervalMiles !== undefined) pkg.serviceIntervalMiles = input.serviceIntervalMiles;
      if (input.serviceIntervalMonths !== undefined) pkg.serviceIntervalMonths = input.serviceIntervalMonths;
      if (input.recommendedParts) pkg.recommendedParts = mapRecommendedPartsInput(input.recommendedParts);
      if (Array.isArray(input.requiredEquipment)) pkg.requiredEquipment = [...input.requiredEquipment];
      if (Array.isArray(input.upsellRecommendations)) pkg.upsellRecommendations = [...input.upsellRecommendations];
      if (Array.isArray(input.inspectionChecklist)) pkg.inspectionChecklist = [...input.inspectionChecklist];
      if (input.safetyNotes !== undefined) pkg.safetyNotes = input.safetyNotes ?? undefined;
      if (typeof input.sameDayEligible === "boolean") pkg.sameDayEligible = input.sameDayEligible;
      if (typeof input.isSeasonal === "boolean") pkg.isSeasonal = input.isSeasonal;
      if (typeof input.isFeatured === "boolean") pkg.isFeatured = input.isFeatured;
      pkg.updatedAt = new Date();
      return pkg;
    },
    deleteServicePackage: async (_: unknown, { id }: { id: string }) => {
      const index = servicePackages.findIndex((pkg) => pkg.id === id);
      if (index === -1) return false;
      servicePackages.splice(index, 1);
      servicePackageById.delete(id);
      return true;
    },
    createAutomationAsset: async (
      _: unknown,
      {
        name,
        type,
        zone,
        assignedBay,
        status,
        manufacturer,
        modelNumber,
      }: { name: string; type: string; zone?: string; assignedBay?: string; status?: string; manufacturer?: string; modelNumber?: string },
    ) => {
      const asset: DemoAutomationAsset = {
        id: `asset-${Date.now()}`,
        assetTag: `AUTO-${Math.floor(Math.random() * 1000)}`,
        name,
        type,
        manufacturer,
        modelNumber,
        status: status ?? "online",
        firmwareVersion: "v1.0.0",
        healthScore: 85,
        utilizationRate: 50,
        zone,
        locationDescription: undefined,
        assignedBay: assignedBay ? ensureServiceBay(assignedBay) ?? undefined : undefined,
        connectedDevices: 0,
        telemetry: [],
        lastHeartbeat: new Date(),
        lastServiceDate: new Date(),
        nextServiceDate: zone ? addDays(new Date(), 30) : undefined,
        serviceIntervalDays: 30,
        safetyAlerts: [],
        notes: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      automationAssets.unshift(asset);
      automationAssetById.set(asset.id, asset);
      return asset;
    },
    updateAutomationAsset: async (
      _: unknown,
      { id, status, utilizationRate, firmwareVersion, nextServiceDate, notes }: { id: string; status?: string; utilizationRate?: number; firmwareVersion?: string; nextServiceDate?: string; notes?: string },
    ) => {
      const asset = automationAssetById.get(id);
      if (!asset) throw new Error("Automation asset not found in demo dataset");
      if (status) asset.status = status;
      if (typeof utilizationRate === "number") asset.utilizationRate = utilizationRate;
      if (firmwareVersion) asset.firmwareVersion = firmwareVersion;
      if (nextServiceDate) asset.nextServiceDate = new Date(nextServiceDate);
      if (notes !== undefined) asset.notes = notes ?? undefined;
      asset.updatedAt = new Date();
      return asset;
    },
    createInventoryItem: async (_: unknown, { input }: { input: Partial<DemoInventoryItem> }) => {
      const id = `inv-${Date.now()}`;
      const supplier = supplierById.get(input.supplierId ?? suppliers[0].id) ?? suppliers[0];
      const base: DemoInventoryItem = {
        id,
        name: input.name ?? "New Inventory Item",
        category: input.category ?? "Misc",
        partNumber: input.partNumber ?? id,
        unit: input.unit ?? "each",
        currentStock: input.currentStock ?? 0,
        minThreshold: input.minThreshold ?? 0,
        parLevel: input.parLevel ?? (input.minThreshold ?? 0) * 1.5,
        restockPeriod: input.restockPeriod ?? "weekly",
        restockDays: input.restockDays ?? 7,
        reorderPoint: input.reorderPoint ?? 0,
        reorderQuantity: input.reorderQuantity ?? 0,
        safetyStock: input.safetyStock ?? 0,
        maxCapacity: input.maxCapacity ?? 0,
        costPerUnit: input.costPerUnit ?? 0,
        status: "in_stock",
        totalValue: 0,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplier,
        preferredSupplier: input.preferredSupplier ?? supplier.name,
        vendorSku: input.vendorSku,
        alternateSuppliers: input.alternateSuppliers ?? [],
        contractPricingTier: input.contractPricingTier,
        universalFit: input.universalFit ?? false,
        vehicleSystems: input.vehicleSystems ?? [],
        storageLocation: input.storageLocation,
        compatibility: input.compatibility,
        msrp: input.msrp,
        leadTimeDays: input.leadTimeDays,
        averageMonthlyUsage: input.averageMonthlyUsage,
        averageDailyUsage: input.averageDailyUsage ??
          (input.averageMonthlyUsage ? Number(((input.averageMonthlyUsage ?? 0) / 30).toFixed(2)) : undefined),
        minimumOrderQuantity: input.minimumOrderQuantity,
        palletQuantity: input.palletQuantity,
        lastStockedDate: new Date(),
        lastIssuedDate: undefined,
        wasteCategory: input.wasteCategory,
        waste: input.waste ?? 0,
        wasteNotes: input.wasteNotes,
        wasteLogs: mapDemoWasteLogs(input.wasteLogs),
        images: input.images ?? [],
        documents: input.documents ?? [],
        notes: input.notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const item: DemoInventoryItem = { ...base, ...input } as DemoInventoryItem;
      item.supplier = item.supplierId ? supplierById.get(item.supplierId) ?? supplier : supplier;
      item.supplierName = item.supplier?.name ?? supplier.name;
      item.preferredSupplier = item.preferredSupplier ?? item.supplierName;
      item.alternateSuppliers = input.alternateSuppliers ?? item.alternateSuppliers ?? [];
      item.wasteLogs = mapDemoWasteLogs(input.wasteLogs ?? item.wasteLogs);
      item.status = computeInventoryStatus(item.currentStock, item.minThreshold, item.safetyStock);
      item.totalValue = Number((item.currentStock * item.costPerUnit).toFixed(2));
      inventoryItems.push(item);
      inventoryById.set(item.id, item);
      return item;
    },
    updateInventoryItem: async (_: unknown, { id, input }: { id: string; input: Partial<DemoInventoryItem> }) => {
      const item = inventoryById.get(id);
      if (!item) throw new Error("Inventory item not found in demo dataset");
      Object.assign(item, input, { updatedAt: new Date() });
      if (input.supplierId) {
        const nextSupplier = supplierById.get(input.supplierId) ?? suppliers[0];
        item.supplierId = nextSupplier.id;
        item.supplier = nextSupplier;
        item.supplierName = nextSupplier.name;
        if (!input.preferredSupplier) {
          item.preferredSupplier = nextSupplier.name;
        }
      }
      if (input.wasteLogs) item.wasteLogs = mapDemoWasteLogs(input.wasteLogs);
      if (input.alternateSuppliers) item.alternateSuppliers = input.alternateSuppliers;
      item.status = computeInventoryStatus(item.currentStock, item.minThreshold, item.safetyStock);
      item.totalValue = Number((item.currentStock * item.costPerUnit).toFixed(2));
      return item;
    },
    deleteInventoryItem: async (_: unknown, { id }: { id: string }) => {
      const index = inventoryItems.findIndex((item) => item.id === id);
      if (index >= 0) {
        inventoryItems.splice(index, 1);
        inventoryById.delete(id);
      }
      return true;
    },
    recordInventoryTransaction: async (
      _: unknown,
      { itemId, quantity, unitCost, transactionType, notes }: { itemId: string; quantity: number; unitCost: number; transactionType: string; notes?: string },
    ) => {
      const item = inventoryById.get(itemId);
      if (!item) throw new Error("Inventory item not found in demo dataset");
      const before = item.currentStock;
      const delta = Number(quantity) || 0;
      const additions = ["purchase", "return_to_stock", "transfer_in", "core_return", "adjustment_positive"];
      if (additions.includes(transactionType)) {
        item.currentStock = before + delta;
        item.lastStockedDate = new Date();
      } else {
        item.currentStock = Math.max(0, before - delta);
        item.lastIssuedDate = new Date();
      }
      item.totalValue = Number((item.currentStock * item.costPerUnit).toFixed(2));
      item.status = computeInventoryStatus(item.currentStock, item.minThreshold, item.safetyStock);

      const transaction: DemoTransaction = {
        id: `txn-${Date.now()}`,
        inventoryItem: item,
        transactionType,
        quantity: delta,
        unitCost,
        totalCost: Number((delta * unitCost).toFixed(2)),
        balanceBefore: before,
        balanceAfter: item.currentStock,
        createdAt: new Date(),
        notes,
      };
      transactions.unshift(transaction);
      return transaction;
    },
    recordInventoryWaste: async (
      _: unknown,
      { itemId, quantity, reason, label, notes, unitCost }: { itemId: string; quantity: number; reason: string; label?: string; notes?: string; unitCost?: number },
    ) => {
      const item = inventoryById.get(itemId);
      if (!item) throw new Error("Inventory item not found in demo dataset");
      const wasteQuantity = Number(quantity) || 0;
      const cost = Number(unitCost ?? item.costPerUnit ?? 0);
      const wasteLog: DemoWasteLog = {
        id: `waste-${Date.now()}`,
        date: new Date(),
        quantity: wasteQuantity,
        unitCost: cost,
        label,
        reason,
        notes,
        recordedById: "demo-user",
        recordedByName: "Demo Supervisor",
      };
      if (!Array.isArray(item.wasteLogs)) item.wasteLogs = [];
      item.wasteLogs.unshift(wasteLog);
      item.waste = Number(item.waste ?? 0) + wasteQuantity;
      if (label) item.wasteCategory = label;
      if (notes) item.wasteNotes = notes;
      const before = item.currentStock;
      item.currentStock = Math.max(0, before - wasteQuantity);
      item.totalValue = Number((item.currentStock * item.costPerUnit).toFixed(2));
      item.status = computeInventoryStatus(item.currentStock, item.minThreshold, item.safetyStock);
      const transaction: DemoTransaction = {
        id: `txn-${Date.now()}`,
        inventoryItem: item,
        transactionType: "waste",
        quantity: wasteQuantity,
        unitCost: cost,
        totalCost: Number((wasteQuantity * cost).toFixed(2)),
        balanceBefore: before,
        balanceAfter: item.currentStock,
        createdAt: new Date(),
        notes: reason,
      };
      transactions.unshift(transaction);
      return item;
    },
    createPurchaseOrder: async (
      _: unknown,
      { supplierId, items, notes, expectedDeliveryDate }: { supplierId: string; items: Array<{ inventoryItemId: string; quantity: number; unitCost: number; unit?: string }>; notes?: string; expectedDeliveryDate?: string },
    ) => {
      const supplier = supplierById.get(supplierId);
      if (!supplier) throw new Error("Supplier not found in demo dataset");
      if (!items?.length) throw new Error("At least one item is required");
      const poItems = items.map((line) => {
        const inventoryItem = inventoryById.get(line.inventoryItemId);
        if (!inventoryItem) throw new Error("Inventory item not found in demo dataset");
        return {
          inventoryItem,
          name: inventoryItem.name,
          partNumber: inventoryItem.partNumber,
          quantityOrdered: line.quantity,
          quantityReceived: 0,
          unit: line.unit ?? inventoryItem.unit,
          unitCost: line.unitCost,
          totalCost: Number((line.quantity * line.unitCost).toFixed(2)),
          backorderedQuantity: 0,
        };
      });
      const subtotal = poItems.reduce((sum, line) => sum + line.totalCost, 0);
      const po: DemoPurchaseOrder = {
        id: `po-${Date.now()}`,
        poNumber: `PO-2025-${String(purchaseOrders.length + 3).padStart(4, "0")}`,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplier,
        status: "draft",
        orderDate: new Date(),
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined,
        items: poItems,
        subtotal: Number(subtotal.toFixed(2)),
        tax: 0,
        freight: 0,
        miscFees: 0,
        total: Number(subtotal.toFixed(2)),
        notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      purchaseOrders.unshift(po);
      return po;
    },
    updatePurchaseOrderStatus: async (_: unknown, { id, status }: { id: string; status: string }) => {
      const po = purchaseOrders.find((order) => order.id === id);
      if (!po) throw new Error("Purchase order not found in demo dataset");
      po.status = status;
      po.updatedAt = new Date();
      if (status === "received") {
        po.expectedDeliveryDate = new Date();
      }
      return po;
    },
    createInvoice: async (_: unknown, { input }: { input: Partial<DemoInvoice> }) => {
      const id = `inv-${Date.now()}`;
      const invoice: DemoInvoice = {
        id,
        invoiceNumber: input.invoiceNumber ?? `INV-${Date.now()}`,
        clientName: input.clientName ?? "Walk-in Customer",
        status: input.status ?? "open",
        issuedDate: input.issuedDate ? new Date(input.issuedDate) : new Date(),
        dueDate: input.dueDate ? new Date(input.dueDate) : addDays(new Date(), 30),
        amount: input.amount ?? 0,
        laborTotal: input.laborTotal ?? 0,
        partsTotal: input.partsTotal ?? 0,
        tax: input.tax ?? 0,
        shopSupplies: input.shopSupplies ?? 0,
        hazmatFee: input.hazmatFee ?? 0,
        discounts: input.discounts ?? 0,
        totalAmount: input.totalAmount ?? 0,
        balanceDue: input.balanceDue ?? input.totalAmount ?? 0,
        notes: input.notes,
        vehicle:
          input.vehicle ?? {
            vin: "",
            year: new Date().getFullYear(),
            make: "",
            model: "",
            mileageIn: 0,
            mileageOut: 0,
          },
        advisor: input.advisor ?? { id: teamMembers[1].id, name: teamMembers[1].name },
        laborLines: input.laborLines ?? [],
        partsLines: input.partsLines ?? [],
        payments: input.payments ?? [],
        followUpReminders: input.followUpReminders ?? [],
      };
      invoices.unshift(invoice);
      return invoice;
    },
    updateInvoice: async (_: unknown, { id, input }: { id: string; input: Partial<DemoInvoice> }) => {
      const invoice = invoices.find((inv) => inv.id === id);
      if (!invoice) throw new Error("Invoice not found in demo dataset");
      Object.assign(invoice, input);
      if (input.issuedDate) invoice.issuedDate = new Date(input.issuedDate);
      if (input.dueDate) invoice.dueDate = new Date(input.dueDate);
      return invoice;
    },
    addInvoicePayment: async (
      _: unknown,
      { input }: { input: { invoiceId: string; amount: number; method: string; receivedBy: string; date?: string } },
    ) => {
      const invoice = invoices.find((inv) => inv.id === input.invoiceId);
      if (!invoice) throw new Error("Invoice not found in demo dataset");
      invoice.payments.push({
        amount: input.amount,
        method: input.method,
        receivedBy: input.receivedBy,
        date: input.date ? new Date(input.date) : new Date(),
      });
      invoice.balanceDue = Math.max(0, Number((invoice.balanceDue - input.amount).toFixed(2)));
      if (invoice.balanceDue === 0) {
        invoice.status = "paid";
      }
      return invoice;
    },
    updateInvoiceStatus: async (_: unknown, { id, status }: { id: string; status: string }) => {
      const invoice = invoices.find((inv) => inv.id === id);
      if (!invoice) throw new Error("Invoice not found in demo dataset");
      invoice.status = status;
      if (status === "paid") {
        invoice.balanceDue = 0;
      }
      return invoice;
    },
  },
};


