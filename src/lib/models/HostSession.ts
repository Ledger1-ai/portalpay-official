import mongoose, { Document, Schema } from 'mongoose';

export interface IHostSession extends Document {
  presetSlug: string;
  presetName: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'live' | 'ended';
  servers: Array<{ id: string; name: string; department?: string; role?: string; isActive?: boolean }>;
  assignments: Array<{ serverId: string; domainIds: string[] }>;
  tableOccupied: Record<string, boolean>;
  seatings: Array<{ id: string; serverId: string; tableId: string; partySize: number; startedAt: Date; completedAt?: Date; status: 'seated' | 'completed' | 'cancelled'; toastTableName?: string; toastOrderGuid?: string }>;
  rotation: { isLive: boolean; order: string[]; pointer: number };
  // Lock and persistence fields
  assignmentsLocked?: boolean;
  domainsLocked?: boolean;
  domains?: Array<{ id: string; name: string; color: string; tableIds: string[] }>;
  layoutSlug?: string;
}

const HostAssignmentSchema = new Schema<{ serverId: string; domainIds: string[] }>({
  serverId: { type: String, required: true },
  domainIds: { type: [String], required: true },
}, { _id: false });

const SeatingSchema = new Schema<{ id: string; serverId: string; tableId: string; partySize: number; startedAt: Date; completedAt?: Date; status: 'seated' | 'completed' | 'cancelled'; toastTableName?: string; toastOrderGuid?: string }>({
  id: { type: String, required: true },
  serverId: { type: String, required: true },
  tableId: { type: String, required: true },
  partySize: { type: Number, required: true },
  startedAt: { type: Date, required: true },
  completedAt: { type: Date },
  status: { type: String, enum: ['seated','completed','cancelled'], default: 'seated' },
  toastTableName: { type: String },
  toastOrderGuid: { type: String },
}, { _id: false });

const HostSessionSchema = new Schema<IHostSession>({
  presetSlug: { type: String, required: true },
  presetName: { type: String, required: true },
  startedAt: { type: Date, required: true, default: Date.now },
  endedAt: { type: Date },
  status: { type: String, enum: ['live', 'ended'], required: true, default: 'live', index: true },
  servers: { type: [Object], default: [] },
  assignments: { type: [HostAssignmentSchema], default: [] },
  tableOccupied: { type: Schema.Types.Mixed, default: {} },
  seatings: { type: [SeatingSchema], default: [] },
  rotation: { type: new Schema({ isLive: Boolean, order: [String], pointer: Number }, { _id: false }), default: { isLive: false, order: [], pointer: 0 } },
  assignmentsLocked: { type: Boolean, default: false },
  domainsLocked: { type: Boolean, default: false },
  domains: { type: [Object], default: [] },
  layoutSlug: { type: String },
}, { timestamps: true });

HostSessionSchema.index({ status: 1, startedAt: -1 });

const HostSession = mongoose.models.HostSession || mongoose.model<IHostSession>('HostSession', HostSessionSchema);

export default HostSession;


