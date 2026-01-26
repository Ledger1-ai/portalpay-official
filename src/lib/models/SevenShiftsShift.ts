import mongoose, { Document, Schema } from 'mongoose';

export interface ISevenShiftsShift extends Document {
  shiftId: number;
  userId: number;
  locationId: number;
  departmentId: number;
  roleId: number;
  start: Date;
  end: Date;
  close: boolean;
  businessDecline: boolean;
  notes: string;
  draft: boolean;
  notified: boolean;
  open: boolean;
  openOfferType: number;
  attendanceStatus: string;
  dailyOvertime: number;
  weeklyOvertime: number;
  companyId: number;
  stationName: string;
  stationId: number;
  recordId: number;
  unassigned: boolean;
  unassignedRole: {
    id: number;
    name: string;
  };
  openTimeSlots: any[];
  lateMinutes: number;
  meta: {
    recordId: number;
  };
}

const SevenShiftsShiftSchema: Schema = new Schema({
  shiftId: { type: Number, required: true, unique: true },
  userId: { type: Number, required: true, index: true },
  locationId: { type: Number, required: true, index: true },
  departmentId: { type: Number },
  roleId: { type: Number },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  close: { type: Boolean },
  businessDecline: { type: Boolean },
  notes: { type: String },
  draft: { type: Boolean },
  notified: { type: Boolean },
  open: { type: Boolean },
  openOfferType: { type: Number },
  attendanceStatus: { type: String },
  dailyOvertime: { type: Number },
  weeklyOvertime: { type: Number },
  companyId: { type: Number },
  stationName: { type: String },
  stationId: { type: Number },
  recordId: { type: Number },
  unassigned: { type: Boolean },
  unassignedRole: {
    id: { type: Number },
    name: { type: String },
  },
  openTimeSlots: { type: Array },
  lateMinutes: { type: Number },
  meta: {
    recordId: { type: Number },
  },
}, {
  timestamps: true,
  collection: 'sevenshiftsshifts',
});

const SevenShiftsShift = mongoose.models.SevenShiftsShift || mongoose.model<ISevenShiftsShift>('SevenShiftsShift', SevenShiftsShiftSchema);

export default SevenShiftsShift;
