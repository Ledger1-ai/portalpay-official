import mongoose from 'mongoose';

const performanceEntrySchema = new mongoose.Schema({
  restaurantGuid: {
    type: String,
    required: true,
    index: true,
  },
  employeeToastGuid: {
    type: String,
    required: true,
    index: true,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  isFlag: {
    type: Boolean,
    default: false,
  },
  flagType: {
    type: String,
    enum: ['red', 'yellow', 'blue', null],
    default: null,
  },
  details: {
    type: String,
    trim: true,
    maxlength: 2000,
  },
  salesGenerated: {
    type: Number,
    default: 0
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: String,
  },
}, {
  timestamps: true,
});

performanceEntrySchema.index({ restaurantGuid: 1, employeeToastGuid: 1, createdAt: -1 });

const PerformanceEntry = mongoose.models.PerformanceEntry || mongoose.model('PerformanceEntry', performanceEntrySchema);

export default PerformanceEntry;

