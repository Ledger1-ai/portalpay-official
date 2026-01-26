import mongoose from 'mongoose';
import { hashPassword, verifyPassword } from '../auth/password';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 255,
    validate: {
      validator: function (email: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Please provide a valid email address'
    }
  },
  role: {
    type: String,
    required: true,
    default: 'Staff'
  },
  avatar: {
    type: String,
    default: ''
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false // Don't include password in queries by default
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  permissions: [{
    type: String,
    enum: [
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
      'admin'
    ]
  }],
  // Security fields
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  // Two-Factor Authentication fields
  twoFactorSecret: {
    type: String,
    select: false // Don't include in queries by default
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorVerified: {
    type: Boolean,
    default: false
  },
  backupCodes: [{
    type: String,
    select: false // Don't include in queries by default
  }],
  // First login and password management
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  passwordChangedAt: {
    type: Date,
    default: Date.now
  },
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  toastGuid: { type: String, sparse: true },
  sevenShiftsId: { type: Number, sparse: true },
}, {
  timestamps: true
});

// Indexes for better performance (email already unique in schema)
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ lockUntil: 1 });
// Text index for global/user search
try {
  userSchema.index({ name: 'text', email: 'text', role: 'text' }, { name: 'user_text', weights: { name: 10, email: 8, role: 4 } });
} catch { }

// Virtual for checking if account is locked
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next: any) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash password
    this.password = await hashPassword(this.password);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to verify password
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return await verifyPassword(candidatePassword, this.password);
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }

  const updates: { $inc?: { loginAttempts: number }; $set?: { lockUntil: number } } = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Method to get user permissions based on role
userSchema.methods.getPermissions = function (): string[] {
  const rolePermissions: { [key: string]: string[] } = {
    'Super Admin': [
      'dashboard',
      'scheduling',
      'inventory',
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
      'admin'
    ],
    'Manager': [
      'dashboard',
      'scheduling',
      'inventory',
      'inventory:financial',
      'team',
      'team:performance',
      'analytics',
      'analytics:detailed',
      'roster',
      'menu',
      'robotic-fleets',
      'hostpro'
    ],
    'Shift Supervisor': [
      'dashboard',
      'scheduling',
      'inventory', // Basic inventory view for shift needs
      'team', // Basic team info but no detailed performance
      'roster',
      'hostpro'
    ],
    'Staff': [
      'dashboard',
      'inventory' // Basic inventory access for staff
    ]
  };

  const defaultPermissions = rolePermissions[this.role] || ['dashboard'];
  return [...new Set([...defaultPermissions, ...(this.permissions || [])])];
};

// Method to check if password needs to be changed
userSchema.methods.needsPasswordChange = function (): boolean {
  return this.isFirstLogin || this.mustChangePassword;
};

// Method to mark password as changed
userSchema.methods.markPasswordChanged = function () {
  this.isFirstLogin = false;
  this.mustChangePassword = false;
  this.passwordChangedAt = new Date();
  return this;
};

// Method to force password change
userSchema.methods.forcePasswordChange = function () {
  this.mustChangePassword = true;
  return this;
};

// Method to enable 2FA
userSchema.methods.enable2FA = function (secret: string, backupCodes: string[]) {
  return this.updateOne({
    $set: {
      twoFactorSecret: secret,
      twoFactorEnabled: true,
      twoFactorVerified: true,
      backupCodes: backupCodes
    }
  });
};

// Method to disable 2FA
userSchema.methods.disable2FA = function () {
  return this.updateOne({
    $unset: {
      twoFactorSecret: 1,
      backupCodes: 1
    },
    $set: {
      twoFactorEnabled: false,
      twoFactorVerified: false
    }
  });
};

// Method to use backup code
userSchema.methods.useBackupCode = function (code: string) {
  if (this.backupCodes) {
    const index = this.backupCodes.indexOf(code);
    if (index > -1) {
      this.backupCodes.splice(index, 1);
    }
  }
  return this;
};

// Static method to find by email (case insensitive)
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find active users
userSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

// Pre-update middleware to update updatedBy field
userSchema.pre(['updateOne', 'findOneAndUpdate'], function (next: any) {
  if (this.getOptions().runValidators !== false) {
    this.setOptions({ runValidators: true, context: 'query' });
  }
  next();
});

// Force recompilation in development to pick up schema changes
if (mongoose.models.User) {
  delete mongoose.models.User;
}

const User = mongoose.model('User', userSchema);

export { User }; 