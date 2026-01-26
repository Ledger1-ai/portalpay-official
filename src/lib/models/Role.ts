import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRole extends Document {
  name: string;
  description?: string;
  permissions: string[];
  color: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const allowedPermissions = [
  'dashboard',
  'scheduling',
  'inventory',
  'invoicing',
  'inventory:financial',
  'team',
  'team:performance',
  'team:management',
  'analytics',
  'analytics:detailed',
  'settings',
  'settings:users',
  'settings:system',
  'roster',
  'menu',
  'robotic-fleets',
  'hostpro',
  'admin',
] as const;

const RoleSchema = new Schema<IRole>({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  permissions: [{ type: String, enum: allowedPermissions, default: [] }],
  color: { type: String, default: 'bg-slate-500' },
  isSystem: { type: Boolean, default: false },
}, { timestamps: true });

const Role: Model<IRole> = mongoose.models.Role || mongoose.model<IRole>('Role', RoleSchema);

export { Role, allowedPermissions };


