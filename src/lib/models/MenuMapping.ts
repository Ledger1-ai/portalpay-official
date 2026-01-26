import mongoose from 'mongoose';

const componentSchema = new mongoose.Schema({
  kind: { type: String, enum: ['inventory', 'menu'], required: true },
  inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
  nestedToastItemGuid: { type: String },
  modifierOptionGuid: { type: String },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true },
  notes: { type: String },
}, { _id: false });

// Self-referential overrides: allow overriding nested menu item's components in context
componentSchema.add({ overrides: [componentSchema] });

const menuMappingSchema = new mongoose.Schema({
  restaurantGuid: { type: String, required: true },
  toastItemGuid: { type: String, required: true },
  toastItemName: { type: String },
  toastItemSku: { type: String },
  components: { type: [componentSchema], default: [] },
  recipeSteps: [{
    step: { type: Number, required: true },
    instruction: { type: String, required: true },
    time: { type: Number },
    notes: { type: String },
  }],
  recipeMeta: {
    servings: { type: Number },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    prepTime: { type: Number },
    cookTime: { type: Number },
    totalTime: { type: Number },
    equipment: { type: [String], default: [] },
    miseEnPlace: { type: [String], default: [] },
    plating: { type: String },
    allergens: { type: [String], default: [] },
    tasteProfile: { type: [String], default: [] },
    priceyness: { type: Number, min: 1, max: 4 },
    cuisinePreset: { type: String },
    atmospherePreset: { type: String },
    notes: { type: String },
  },
  computedCostCache: { type: Number, default: 0 },
  lastComputedAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

menuMappingSchema.index({ restaurantGuid: 1, toastItemGuid: 1 }, { unique: true });

export const MenuMapping = mongoose.models.MenuMapping || mongoose.model('MenuMapping', menuMappingSchema);


