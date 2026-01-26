import mongoose from "mongoose";

const laborLineSchema = new mongoose.Schema(
  {
    servicePackage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServicePackage",
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamMember",
    },
    hours: {
      type: Number,
      required: true,
      min: 0,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const partsLineSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    taxable: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: ["cash", "card", "ach", "check", "financing", "warranty"],
      default: "card",
    },
    reference: String,
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { _id: false },
);

const vehicleSchema = new mongoose.Schema(
  {
    vin: String,
    year: Number,
    make: String,
    model: String,
    trim: String,
    mileageIn: Number,
    mileageOut: Number,
    licensePlate: String,
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    serviceLaneTicket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceLaneTicket",
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    clientEmail: {
      type: String,
      trim: true,
    },
    clientPhone: {
      type: String,
      trim: true,
    },
    vehicle: vehicleSchema,
    advisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamMember",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    laborTotal: {
      type: Number,
      default: 0,
    },
    partsTotal: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    shopSupplies: {
      type: Number,
      default: 0,
    },
    hazmatFee: {
      type: Number,
      default: 0,
    },
    discounts: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "awaiting_approval", "pending", "paid", "partial", "void"],
      default: "draft",
    },
    issuedDate: {
      type: Date,
      default: Date.now,
    },
    paidDate: Date,
    description: {
      type: String,
      trim: true,
    },
    paymentTerms: {
      type: String,
      default: "Due on Receipt",
    },
    customerAuthorization: {
      authorizedAt: Date,
      signatureUrl: String,
      approvedBy: String,
    },
    laborLines: [laborLineSchema],
    partsLines: [partsLineSchema],
    payments: [paymentSchema],
    notes: String,
    warrantyNotes: String,
    followUpReminders: [
      {
        description: String,
        dueDate: Date,
      },
    ],
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

invoiceSchema.index({ clientName: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ dueDate: 1 });

invoiceSchema.pre("save", function (next: any) {
  const labor = Array.isArray(this.laborLines)
    ? this.laborLines.reduce((sum, line) => sum + Number(line.total || 0), 0)
    : 0;
  const parts = Array.isArray(this.partsLines)
    ? this.partsLines.reduce((sum, line) => sum + Number(line.total || 0), 0)
    : 0;
  this.laborTotal = labor;
  this.partsTotal = parts;
  const subtotal = labor + parts + Number(this.shopSupplies || 0) + Number(this.hazmatFee || 0) - Number(this.discounts || 0);
  this.amount = subtotal;
  this.totalAmount = subtotal + Number(this.tax || 0);
  const paymentsTotal = Array.isArray(this.payments)
    ? this.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    : 0;
  this.balanceDue = Math.max(this.totalAmount - paymentsTotal, 0);
  next();
});

invoiceSchema.statics.generateInvoiceNumber = async function () {
  const lastInvoice = await this.findOne().sort({ createdAt: -1 }).lean();
  const prefix = `AUTO-${new Date().getFullYear()}`;
  if (!lastInvoice || typeof lastInvoice.invoiceNumber !== "string") {
    return `${prefix}-0001`;
  }
  const match = /^(AUTO-\d{4})-(\d{4})$/.exec(lastInvoice.invoiceNumber);
  if (!match) {
    return `${prefix}-0001`;
  }
  const next = String(Number(match[2]) + 1).padStart(4, "0");
  return `${prefix}-${next}`;
};

export const Invoice =
  mongoose.models.Invoice ||
  mongoose.model("Invoice", invoiceSchema);
