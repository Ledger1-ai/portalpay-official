import mongoose from "mongoose";

const compatibilitySchema = new mongoose.Schema(
  {
    make: {
      type: String,
      trim: true,
    },
    models: [
      {
        type: String,
        trim: true,
      },
    ],
    years: [Number],
    notes: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const inventoryItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Braking",
        "Powertrain",
        "Electrical",
        "Suspension",
        "Fluids",
        "Diagnostics",
        "HVAC",
        "Tires",
        "Body",
        "Interior",
        "Shop Supplies",
        "Tools",
        "Accessories",
        "Detailing",
        "Fleet",
      ],
      default: "Shop Supplies",
    },
    subcategory: {
      type: String,
      trim: true,
    },
    segment: {
      type: String,
      enum: ["OEM", "OE Equivalent", "Aftermarket", "Performance"],
      default: "OE Equivalent",
    },
    partNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    oemPartNumber: {
      type: String,
      trim: true,
    },
    aftermarketPartNumber: {
      type: String,
      trim: true,
    },
    barcode: {
      type: String,
      sparse: true,
      unique: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    manufacturer: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    compatibility: [compatibilitySchema],
    universalFit: {
      type: Boolean,
      default: false,
    },
    vehicleSystems: [
      {
        type: String,
        trim: true,
      },
    ],
    storageLocation: {
      aisle: String,
      shelf: String,
      bin: String,
    },
    unit: {
      type: String,
      required: true,
      default: "each",
      trim: true,
    },
    unitOfMeasure: {
      type: String,
      default: "each",
    },
    currentStock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    minThreshold: {
      type: Number,
      default: 2,
      min: 0,
    },
    parLevel: {
      type: Number,
      min: 0,
    },
    restockPeriod: {
      type: String,
      enum: ["daily", "weekly", "biweekly", "monthly", "custom"],
      default: "weekly",
    },
    restockDays: {
      type: Number,
      min: 1,
      default: 7,
    },
    reorderPoint: {
      type: Number,
      default: 3,
      min: 0,
    },
    reorderQuantity: {
      type: Number,
      default: 1,
      min: 0,
    },
    safetyStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxCapacity: {
      type: Number,
      default: 10,
      min: 0,
    },
    costPerUnit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    msrp: {
      type: Number,
      min: 0,
    },
    laborMarkup: {
      type: Number,
      min: 0,
    },
    warrantyMonths: {
      type: Number,
      min: 0,
    },
    coreCharge: {
      type: Number,
      min: 0,
      default: 0,
    },
    shelfLifeMonths: {
      type: Number,
      min: 0,
    },
    hazardClass: {
      type: String,
      trim: true,
    },
    weightLbs: {
      type: Number,
      min: 0,
    },
    volumeCubicFt: {
      type: Number,
      min: 0,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    supplierName: {
      type: String,
      trim: true,
    },
    supplierPartNumber: {
      type: String,
      trim: true,
    },
    vendorSku: {
      type: String,
      trim: true,
    },
    preferredSupplier: {
      type: String,
      trim: true,
    },
    alternateSuppliers: [
      {
        name: String,
        contact: String,
        phone: String,
        sku: String,
        price: Number,
        leadTimeDays: Number,
      },
    ],
    contractPricingTier: {
      type: String,
      trim: true,
    },
    leadTimeDays: {
      type: Number,
      default: 2,
      min: 0,
    },
    minimumOrderQuantity: {
      type: Number,
      min: 0,
    },
    palletQuantity: {
      type: Number,
      min: 0,
    },
    averageMonthlyUsage: {
      type: Number,
      default: 0,
      min: 0,
    },
    averageDailyUsage: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastStockedDate: Date,
    lastIssuedDate: Date,
    nextServiceReminderMiles: Number,
    nextServiceReminderMonths: Number,
    wasteCategory: {
      type: String,
      trim: true,
    },
    waste: {
      type: Number,
      default: 0,
      min: 0,
    },
    wasteNotes: {
      type: String,
      trim: true,
    },
    wasteLogs: [
      {
        date: { type: Date, default: Date.now },
        quantity: { type: Number, required: true, min: 0 },
        unitCost: { type: Number, default: 0, min: 0 },
        label: { type: String, trim: true },
        reason: { type: String, required: true, trim: true },
        notes: { type: String, trim: true },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        recordedByName: { type: String, trim: true },
      },
    ],
    images: [String],
    documents: [
      {
        name: String,
        url: String,
        type: String,
        uploadedAt: Date,
      },
    ],
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["in_stock", "low", "critical", "out", "discontinued", "special_order"],
      default: "in_stock",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

inventoryItemSchema.index({ category: 1, subcategory: 1 });
inventoryItemSchema.index({ status: 1 });
inventoryItemSchema.index({ "compatibility.make": 1 });
inventoryItemSchema.index({ preferredSupplier: 1 });
inventoryItemSchema.index({ wasteCategory: 1 });
inventoryItemSchema.index({ "wasteLogs.date": -1 });

inventoryItemSchema.virtual("totalValue").get(function () {
  return Number(this.currentStock || 0) * Number(this.costPerUnit || 0);
});

inventoryItemSchema.pre("save", function (next: any) {
  if (this.currentStock <= 0) {
    this.status = "out";
  } else if (this.currentStock <= Math.max(this.minThreshold, 1)) {
    this.status = "critical";
  } else if (this.currentStock <= Math.max(this.reorderPoint, this.minThreshold + 1)) {
    this.status = "low";
  } else {
    this.status = "in_stock";
  }
  next();
});

export const InventoryItem =
  mongoose.models.InventoryItem ||
  mongoose.model("InventoryItem", inventoryItemSchema);
