import mongoose from "mongoose";

const inventoryTransactionSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    itemName: {
      type: String,
      required: true,
    },
    transactionType: {
      type: String,
      enum: [
        "purchase",
        "issue_to_repair",
        "return_to_stock",
        "warranty",
        "adjustment",
        "transfer_in",
        "transfer_out",
        "scrap",
        "core_return",
        "count_adjustment",
        "vendor_credit",
        "waste",
      ],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
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
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    bay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceBay",
    },
    serviceTicket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceLaneTicket",
    },
    reason: String,
    notes: String,
    referenceType: {
      type: String,
      enum: ["PurchaseOrder", "ServiceTicket", "Manual", "System", "Waste"],
      default: "Manual",
    },
    referenceId: mongoose.Schema.Types.ObjectId,
    referenceNumber: String,
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isReversed: {
      type: Boolean,
      default: false,
    },
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reversedDate: Date,
    reversalReason: String,
  },
  {
    timestamps: true,
  },
);

inventoryTransactionSchema.index({ inventoryItem: 1, createdAt: -1 });
inventoryTransactionSchema.index({ transactionType: 1 });
inventoryTransactionSchema.index({ createdAt: -1 });
inventoryTransactionSchema.index({ referenceType: 1, referenceId: 1 });
inventoryTransactionSchema.index({ supplier: 1 });

export const InventoryTransaction =
  mongoose.models.InventoryTransaction ||
  mongoose.model("InventoryTransaction", inventoryTransactionSchema);
