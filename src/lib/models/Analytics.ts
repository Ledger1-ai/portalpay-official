import mongoose from "mongoose";

const metricSliceSchema = new mongoose.Schema(
  {
    category: String,
    value: Number,
    change: Number,
  },
  { _id: false },
);

const technicianMetricSchema = new mongoose.Schema(
  {
    technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamMember",
    },
    hoursFlagged: Number,
    billedHours: Number,
    efficiency: Number,
    comebacks: Number,
    upsellRate: Number,
  },
  { _id: false },
);

const timeSeriesPointSchema = new mongoose.Schema(
  {
    timestamp: Date,
    label: String,
    value: Number,
  },
  { _id: false },
);

const analyticsSchema = new mongoose.Schema(
  {
    period: {
      type: String,
      required: true,
      enum: ["daily", "weekly", "monthly", "quarterly"],
    },
    date: {
      type: Date,
      required: true,
    },
    totalRevenue: {
      type: Number,
      default: 0,
    },
    laborRevenue: {
      type: Number,
      default: 0,
    },
    partsRevenue: {
      type: Number,
      default: 0,
    },
    grossProfit: {
      type: Number,
      default: 0,
    },
    vehiclesServiced: {
      type: Number,
      default: 0,
    },
    averageRepairOrder: {
      type: Number,
      default: 0,
    },
    bayUtilization: {
      type: Number,
      default: 0,
    },
    technicianEfficiency: {
      type: Number,
      default: 0,
    },
    diagnosticCaptureRate: {
      type: Number,
      default: 0,
    },
    partsTurnoverDays: {
      type: Number,
      default: 0,
    },
    comebackRate: {
      type: Number,
      default: 0,
    },
    customerSatisfaction: {
      type: Number,
      default: 0,
    },
    firstTimeFixRate: {
      type: Number,
      default: 0,
    },
    openEstimates: {
      type: Number,
      default: 0,
    },
    warrantyClaims: {
      type: Number,
      default: 0,
    },
    topServiceCategories: [metricSliceSchema],
    fleetVsRetailMix: [metricSliceSchema],
    revenueTrend: [timeSeriesPointSchema],
    bayPerformance: [
      {
        bay: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ServiceBay",
        },
        utilization: Number,
        throughput: Number,
        averageCycleTimeMinutes: Number,
      },
    ],
    technicianLeaderboard: [technicianMetricSchema],
    alerts: [
      {
        severity: {
          type: String,
          enum: ["info", "warning", "critical"],
          default: "info",
        },
        title: String,
        message: String,
        suggestedAction: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

analyticsSchema.index({ period: 1, date: 1 }, { unique: true });
analyticsSchema.index({ date: 1 });

analyticsSchema.statics.getAnalyticsForRange = async function (
  startDate: Date,
  endDate: Date,
  period: string,
) {
  return this.find({
    date: { $gte: startDate, $lte: endDate },
    period,
  }).sort({ date: 1 });
};

export const Analytics =
  mongoose.models.Analytics ||
  mongoose.model("Analytics", analyticsSchema);
