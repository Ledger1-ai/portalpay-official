import mongoose from 'mongoose';

const labelTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  colors: {
    background: String,
    text: String,
    border: String,
  },
  skuSource: { type: String, enum: ['sku', 'vendorSKU', 'syscoSKU'], default: 'vendorSKU' },
  elements: {
    logo: {
      enabled: Boolean,
      x: Number,
      y: Number,
      width: Number,
      height: Number,
      src: String,
    },
    qrCode: {
      enabled: Boolean,
      x: Number,
      y: Number,
      width: Number,
      height: Number,
    },
    itemName: {
      enabled: Boolean,
      x: Number,
      y: Number,
      width: Number,
      fontSize: Number,
      fontWeight: String,
      textAlign: String,
    },
    metadata: {
      enabled: Boolean,
      x: Number,
      y: Number,
      width: Number,
      fontSize: Number,
      lineHeight: Number,
    }
  },
  // Optionally scope per organization/location/user
  scope: {
    organizationId: { type: String },
    profileId: { type: String },
  },
  isActive: { type: Boolean, default: false },
}, { timestamps: true });

export const LabelTemplate = mongoose.models.LabelTemplate || mongoose.model('LabelTemplate', labelTemplateSchema);


