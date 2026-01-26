import mongoose, { Schema, Document } from 'mongoose';

export interface IToastEmployee extends Document {
  toastGuid: string;
  restaurantGuid: string;
  entityType: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobTitles: Array<{
    guid: string;
    title: string;
    tip: boolean;
    hourlyRate?: number;
  }>;
  externalId?: string;
  createdDate: Date;
  modifiedDate: Date;
  deletedDate?: Date;
  lastSyncDate: Date;
  syncStatus: 'pending' | 'synced' | 'error';
  syncErrors?: string[];
  // Local fields for integration
  localEmployeeId?: mongoose.Types.ObjectId;
  isActive: boolean;
  notes?: string;
  isLocallyDeleted: boolean; // For hiding employees locally while keeping Toast sync
  sevenShiftsId?: number;
}

const ToastEmployeeSchema = new Schema<IToastEmployee>({
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
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    validate: {
      validator: function (v: string) {
        return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  jobTitles: [{
    guid: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    tip: {
      type: Boolean,
      required: true,
    },
    hourlyRate: {
      type: Number,
      min: 0,
    },
  }],
  externalId: String,
  createdDate: {
    type: Date,
    required: true,
  },
  modifiedDate: {
    type: Date,
    required: true,
  },
  deletedDate: Date,
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
  localEmployeeId: {
    type: Schema.Types.ObjectId,
    ref: 'TeamMember',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  notes: String,
  isLocallyDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  sevenShiftsId: {
    type: Number,
    sparse: true,
    unique: true,
  },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete (ret as any)._id;
      delete (ret as any).__v;
      return ret;
    }
  }
});

// Indexes for efficient querying
ToastEmployeeSchema.index({ restaurantGuid: 1, toastGuid: 1 });
ToastEmployeeSchema.index({ syncStatus: 1, lastSyncDate: 1 });
ToastEmployeeSchema.index({ isActive: 1 });

// Virtual for full name
ToastEmployeeSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Static methods
ToastEmployeeSchema.statics.findByRestaurant = function (restaurantGuid: string) {
  return this.find({ restaurantGuid, isActive: true });
};

ToastEmployeeSchema.statics.findPendingSync = function () {
  return this.find({ syncStatus: 'pending' });
};

ToastEmployeeSchema.statics.findByToastGuid = function (toastGuid: string) {
  return this.findOne({ toastGuid });
};

// Instance methods
ToastEmployeeSchema.methods.markSynced = function () {
  this.syncStatus = 'synced';
  this.lastSyncDate = new Date();
  this.syncErrors = [];
  return this.save();
};

ToastEmployeeSchema.methods.markError = function (error: string) {
  this.syncStatus = 'error';
  this.lastSyncDate = new Date();
  if (!this.syncErrors) this.syncErrors = [];
  this.syncErrors.push(error);
  return this.save();
};

const ToastEmployee = mongoose.models.ToastEmployee || mongoose.model<IToastEmployee>('ToastEmployee', ToastEmployeeSchema);

export default ToastEmployee;