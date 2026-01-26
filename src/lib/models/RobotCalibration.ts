import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface CalibrationTransform {
  scaleX: number;
  scaleY: number;
  rotation: number;
  translateX: number;
  translateY: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface CalibrationGrid {
  enabled: boolean;
  size: number;
  originX: number;
  originY: number;
}

export interface Point2D { x: number; y: number; }

export interface IRobotCalibration extends Document {
  slug: string;
  transform: CalibrationTransform;
  grid: CalibrationGrid;
  bounds?: Point2D[];
  createdAt: Date;
  updatedAt: Date;
}

const PointSchema = new Schema<Point2D>({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
}, { _id: false });

const TransformSchema = new Schema<CalibrationTransform>({
  scaleX: { type: Number, default: 1 },
  scaleY: { type: Number, default: 1 },
  rotation: { type: Number, default: 0 },
  translateX: { type: Number, default: 0 },
  translateY: { type: Number, default: 0 },
  flipX: { type: Boolean, default: false },
  flipY: { type: Boolean, default: false },
}, { _id: false });

const GridSchema = new Schema<CalibrationGrid>({
  enabled: { type: Boolean, default: true },
  size: { type: Number, default: 40 },
  originX: { type: Number, default: 0 },
  originY: { type: Number, default: 0 },
}, { _id: false });

const RobotCalibrationSchema = new Schema<IRobotCalibration>({
  slug: { type: String, default: 'default', index: true, unique: true },
  transform: { type: TransformSchema, default: {} },
  grid: { type: GridSchema, default: {} },
  bounds: { type: [PointSchema], default: [] },
}, { timestamps: true });

export default (models.RobotCalibration as mongoose.Model<IRobotCalibration>) || model<IRobotCalibration>('RobotCalibration', RobotCalibrationSchema);


