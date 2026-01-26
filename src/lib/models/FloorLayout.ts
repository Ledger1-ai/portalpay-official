import mongoose, { Schema, Document } from 'mongoose';

export interface IFloorTable {
  id: string;
  type: 'table' | 'booth' | 'barSeat' | 'patio' | 'round';
  x: number; y: number; w: number; h: number;
}

export interface IFloorWall {
  x1: number; y1: number; x2: number; y2: number; thickness?: number;
}

export interface IFloorLayout extends Document {
  slug: string; // e.g., "default"
  imagePath?: string;
  width: number; height: number;
  tables: IFloorTable[];
  walls?: IFloorWall[];
  labels?: Array<{ x: number; y: number; text: string; size?: number }>;
  cachedAt: Date;
}

const TableSchema = new Schema<IFloorTable>({
  id: { type: String, required: true },
  type: { type: String, enum: ['table','booth','barSeat','patio','round'], required: true },
  x: Number, y: Number, w: Number, h: Number,
}, { _id: false });

const WallSchema = new Schema<IFloorWall>({
  x1: Number, y1: Number, x2: Number, y2: Number, thickness: Number,
}, { _id: false });

const FloorLayoutSchema = new Schema<IFloorLayout>({
  slug: { type: String, required: true },
  imagePath: String,
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  tables: { type: [TableSchema], required: true },
  walls: { type: [WallSchema], default: [] },
  labels: { type: [new Schema({ x: Number, y: Number, text: String, size: Number }, { _id: false })], default: [] },
  cachedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

FloorLayoutSchema.index({ slug: 1 }, { unique: true });

const FloorLayout = mongoose.models.FloorLayout || mongoose.model<IFloorLayout>('FloorLayout', FloorLayoutSchema);
export default FloorLayout;


