import mongoose, { Schema, Document } from 'mongoose';

export interface IToastOrder extends Document {
  toastGuid: string;
  restaurantGuid: string;
  entityType: string;
  businessDate: number;
  diningOption: {
    guid: string;
    curbside?: boolean;
    delivery?: boolean;
    dineIn?: boolean;
    takeOut?: boolean;
  };
  checks: Array<{
    guid: string;
    displayNumber: string;
    openedDate: Date;
    closedDate?: Date;
    deletedDate?: Date;
    selections?: unknown[];
    customer?: {
      guid: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    };
  }>;
  createdDate: Date;
  modifiedDate: Date;
  lastSyncDate: Date;
  syncStatus: 'pending' | 'synced' | 'error';
  syncErrors?: string[];
  // Analytics fields
  totalAmount?: number;
  itemCount?: number;
  orderType: 'dine-in' | 'takeout' | 'delivery' | 'curbside';
  isActive: boolean;
}

const ToastOrderSchema = new Schema<IToastOrder>({
  toastGuid: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  restaurantGuid: {
    type: String,
    required: true,
    index: true,
  },
  entityType: {
    type: String,
    required: true,
  },
  businessDate: {
    type: Number,
    required: true,
    index: true,
  },
  diningOption: {
    guid: {
      type: String,
      required: true,
    },
    curbside: Boolean,
    delivery: Boolean,
    dineIn: Boolean,
    takeOut: Boolean,
  },
  checks: [{
    guid: {
      type: String,
      required: true,
    },
    displayNumber: {
      type: String,
      required: true,
    },
    openedDate: {
      type: Date,
      required: true,
    },
    closedDate: Date,
    deletedDate: Date,
    selections: [Schema.Types.Mixed],
    customer: {
      guid: String,
      firstName: String,
      lastName: String,
      email: {
        type: String,
        validate: {
          validator: function (v: string) {
            return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
          },
          message: 'Invalid email format'
        }
      },
      phone: String,
    },
  }],
  createdDate: {
    type: Date,
    required: true,
  },
  modifiedDate: {
    type: Date,
    required: true,
  },
  lastSyncDate: {
    type: Date,
    default: Date.now,
  },
  syncStatus: {
    type: String,
    enum: ['pending', 'synced', 'error'],
    default: 'pending',
  },
  syncErrors: [String],
  totalAmount: {
    type: Number,
    min: 0,
  },
  itemCount: {
    type: Number,
    min: 0,
  },
  orderType: {
    type: String,
    enum: ['dine-in', 'takeout', 'delivery', 'curbside'],
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      // @ts-ignore
      delete ret._id;
      // @ts-ignore
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for efficient querying
ToastOrderSchema.index({ restaurantGuid: 1, businessDate: 1 });
ToastOrderSchema.index({ syncStatus: 1, lastSyncDate: 1 });
ToastOrderSchema.index({ orderType: 1 });
ToastOrderSchema.index({ createdDate: 1 });

// Static methods
ToastOrderSchema.statics.findByRestaurant = function (restaurantGuid: string) {
  return this.find({ restaurantGuid, isActive: true });
};

ToastOrderSchema.statics.findByDateRange = function (
  restaurantGuid: string,
  startDate: Date,
  endDate: Date
) {
  const startBusinessDate = Math.floor(startDate.getTime() / 1000);
  const endBusinessDate = Math.floor(endDate.getTime() / 1000);

  return this.find({
    restaurantGuid,
    businessDate: {
      $gte: startBusinessDate,
      $lte: endBusinessDate,
    },
    isActive: true,
  });
};

ToastOrderSchema.statics.findPendingSync = function () {
  return this.find({ syncStatus: 'pending' });
};

ToastOrderSchema.statics.getOrderAnalytics = function (
  restaurantGuid: string,
  startDate: Date,
  endDate: Date
) {
  const startBusinessDate = Math.floor(startDate.getTime() / 1000);
  const endBusinessDate = Math.floor(endDate.getTime() / 1000);

  return this.aggregate([
    {
      $match: {
        restaurantGuid,
        businessDate: {
          $gte: startBusinessDate,
          $lte: endBusinessDate,
        },
        isActive: true,
      },
    },
    {
      $group: {
        _id: '$orderType',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        averageAmount: { $avg: '$totalAmount' },
        totalItems: { $sum: '$itemCount' },
      },
    },
  ]);
};

// Instance methods
ToastOrderSchema.methods.markSynced = function () {
  this.syncStatus = 'synced';
  this.lastSyncDate = new Date();
  this.syncErrors = [];
  return this.save();
};

ToastOrderSchema.methods.markError = function (error: string) {
  this.syncStatus = 'error';
  this.lastSyncDate = new Date();
  if (!this.syncErrors) this.syncErrors = [];
  this.syncErrors.push(error);
  return this.save();
};

// Pre-save middleware to determine order type
ToastOrderSchema.pre('save', function (next: any) {
  if (this.diningOption.delivery) {
    this.orderType = 'delivery';
  } else if (this.diningOption.curbside) {
    this.orderType = 'curbside';
  } else if (this.diningOption.takeOut) {
    this.orderType = 'takeout';
  } else if (this.diningOption.dineIn) {
    this.orderType = 'dine-in';
  }
  next();
});

const ToastOrder = mongoose.models.ToastOrder || mongoose.model<IToastOrder>('ToastOrder', ToastOrderSchema);

export default ToastOrder;