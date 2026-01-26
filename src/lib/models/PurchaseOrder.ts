import mongoose from "mongoose";

const purchaseOrderItemSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    partNumber: String,
    quantityOrdered: {
      type: Number,
      required: true,
      min: 0,
    },
    quantityReceived: {
      type: Number,
      default: 0,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0,
    },
    backorderedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    expectedShipDate: Date,
    notes: String,
  },
  { _id: false },
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      required: true,
      unique: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    supplierName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "draft",
        "pending_approval",
        "sent",
        "confirmed",
        "receiving",
        "backordered",
        "received",
        "closed",
        "cancelled",
      ],
      default: "draft",
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    expectedShipDate: Date,
    expectedDeliveryDate: Date,
    receivedDate: Date,
    billingTerms: String,
    shippingMethod: String,
    receivingLocation: String,
    items: [purchaseOrderItemSchema],
    subtotal: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    freight: {
      type: Number,
      default: 0,
    },
    miscFees: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedDate: Date,
    acknowledgements: [
      {
        receivedAt: Date,
        message: String,
        code: String,
      },
    ],
    notes: String,
    attachments: [
      {
        name: String,
        url: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

purchaseOrderSchema.index({ supplier: 1 });
purchaseOrderSchema.index({ status: 1 });
purchaseOrderSchema.index({ orderDate: -1 });

purchaseOrderSchema.pre("save", function (next: any) {
  const subtotal = Array.isArray(this.items)
    ? this.items.reduce((sum, item) => sum + Number(item.totalCost || 0), 0)
    : 0;
  this.subtotal = subtotal;
  this.total = subtotal + Number(this.tax || 0) + Number(this.freight || 0) + Number(this.miscFees || 0);
  next();
});

purchaseOrderSchema.statics.generatePoNumber = async function () {
  const lastPO = await this.findOne().sort({ createdAt: -1 }).lean();
  const prefix = `PO-${new Date().getFullYear()}`;
  if (!lastPO || typeof lastPO.poNumber !== "string") {
    return `${prefix}-0001`;
  }
  const match = /^(PO-\d{4})-(\d{4})$/.exec(lastPO.poNumber);
  if (!match) {
    return `${prefix}-0001`;
  }
  const next = String(Number(match[2]) + 1).padStart(4, "0");
  return `${prefix}-${next}`;
};

export const PurchaseOrder =
  mongoose.models.PurchaseOrder ||
  mongoose.model("PurchaseOrder", purchaseOrderSchema);
