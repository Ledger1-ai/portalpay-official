import mongoose from 'mongoose';

const countItemSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  sku: String,
  systemQuantity: {
    type: Number,
    required: true
  },
  countedQuantity: {
    type: Number,
    required: true
  },
  variance: {
    type: Number,
    required: true
  },
  variancePercentage: {
    type: Number,
    required: true
  },
  unitCost: {
    type: Number,
    required: true
  },
  varianceValue: {
    type: Number,
    required: true
  },
  unit: {
    type: String,
    required: true
  },
  location: String,
  batchNumber: String,
  expiryDate: Date,
  condition: {
    type: String,
    enum: ['Good', 'Damaged', 'Expired', 'Near Expiry'],
    default: 'Good'
  },
  notes: String,
  countedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adjustmentApplied: {
    type: Boolean,
    default: false
  },
  adjustmentTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryTransaction'
  }
});

const inventoryCountSchema = new mongoose.Schema({
  countNumber: {
    type: String,
    required: true,
    unique: true
  },
  countType: {
    type: String,
    enum: ['Full Physical', 'Cycle Count', 'Spot Check', 'Category Count', 'ABC Count'],
    required: true
  },
  status: {
    type: String,
    enum: ['Planning', 'In Progress', 'Review', 'Completed', 'Cancelled'],
    default: 'Planning'
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  startedDate: Date,
  completedDate: Date,
  location: String,
  categories: [String],
  items: [countItemSchema],
  summary: {
    totalItems: {
      type: Number,
      default: 0
    },
    itemsWithVariance: {
      type: Number,
      default: 0
    },
    totalVarianceValue: {
      type: Number,
      default: 0
    },
    positiveVarianceValue: {
      type: Number,
      default: 0
    },
    negativeVarianceValue: {
      type: Number,
      default: 0
    },
    accuracyPercentage: {
      type: Number,
      default: 0
    }
  },
  notes: String,
  instructions: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supervisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedDate: Date
}, {
  timestamps: true
});

// Indexes
inventoryCountSchema.index({ countType: 1 });
inventoryCountSchema.index({ status: 1 });
inventoryCountSchema.index({ scheduledDate: 1 });
inventoryCountSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate summary
inventoryCountSchema.pre('save', function (next: any) {
  if (this.items && this.items.length > 0) {
    if (!this.summary) {
      this.summary = {
        totalItems: 0,
        itemsWithVariance: 0,
        totalVarianceValue: 0,
        positiveVarianceValue: 0,
        negativeVarianceValue: 0,
        accuracyPercentage: 0
      };
    }
    this.summary.totalItems = this.items.length;
    this.summary.itemsWithVariance = this.items.filter(item => Math.abs(item.variance) > 0).length;
    this.summary.totalVarianceValue = this.items.reduce((sum, item) => sum + item.varianceValue, 0);
    this.summary.positiveVarianceValue = this.items
      .filter(item => item.varianceValue > 0)
      .reduce((sum, item) => sum + item.varianceValue, 0);
    this.summary.negativeVarianceValue = this.items
      .filter(item => item.varianceValue < 0)
      .reduce((sum, item) => sum + Math.abs(item.varianceValue), 0);

    const accurateItems = this.items.filter(item => Math.abs(item.variancePercentage) <= 2).length;
    this.summary.accuracyPercentage = (accurateItems / this.summary.totalItems) * 100;
  }
  next();
});

export const InventoryCount = mongoose.models.InventoryCount || mongoose.model('InventoryCount', inventoryCountSchema);
