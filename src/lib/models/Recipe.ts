import mongoose from 'mongoose';

const recipeIngredientSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true
  },
  costPerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  totalCost: {
    type: Number,
    required: true,
    min: 0
  },
  notes: String,
  isOptional: {
    type: Boolean,
    default: false
  }
});

const nutritionInfoSchema = new mongoose.Schema({
  calories: Number,
  protein: Number,
  carbs: Number,
  fat: Number,
  fiber: Number,
  sodium: Number,
  allergens: [String]
});

const recipeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Appetizer', 'Main Course', 'Dessert', 'Beverage', 'Side Dish', 'Sauce', 'Dressing', 'Prep Item', 'Other'],
    default: 'Other'
  },
  cuisine: String,
  servings: {
    type: Number,
    required: true,
    min: 1
  },
  prepTime: Number, // minutes
  cookTime: Number, // minutes
  totalTime: Number, // minutes
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  ingredients: [recipeIngredientSchema],
  instructions: [{
    step: Number,
    instruction: String,
    time: Number, // minutes
    temperature: Number, // fahrenheit
    notes: String
  }],
  nutrition: nutritionInfoSchema,
  foodCost: {
    type: Number,
    default: 0
  },
  foodCostPerServing: {
    type: Number,
    default: 0
  },
  laborCost: {
    type: Number,
    default: 0
  },
  totalCost: {
    type: Number,
    default: 0
  },
  costPerServing: {
    type: Number,
    default: 0
  },
  menuPrice: {
    type: Number,
    default: 0
  },
  targetFoodCostPercentage: {
    type: Number,
    default: 30
  },
  actualFoodCostPercentage: {
    type: Number,
    default: 0
  },
  grossMargin: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  seasonalItem: {
    type: Boolean,
    default: false
  },
  tags: [String],
  images: [String],
  notes: String,
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
recipeSchema.index({ name: 1 });
recipeSchema.index({ category: 1 });
recipeSchema.index({ isActive: 1 });
recipeSchema.index({ isPopular: 1 });
recipeSchema.index({ actualFoodCostPercentage: 1 });
// Text index for global search on recipes
try {
  recipeSchema.index({ name: 'text', description: 'text', category: 'text', tags: 'text' }, { name: 'recipe_text', weights: { name: 10, category: 5, description: 3, tags: 3 } });
} catch { }

// Pre-save middleware to calculate costs
recipeSchema.pre('save', function (next: any) {
  // Calculate food cost
  this.foodCost = this.ingredients.reduce((sum, ingredient) => sum + ingredient.totalCost, 0);
  this.foodCostPerServing = this.servings > 0 ? this.foodCost / this.servings : 0;

  // Calculate total cost (food + labor)
  this.totalCost = this.foodCost + (this.laborCost || 0);
  this.costPerServing = this.servings > 0 ? this.totalCost / this.servings : 0;

  // Calculate food cost percentage and margin
  if (this.menuPrice > 0) {
    this.actualFoodCostPercentage = (this.foodCostPerServing / this.menuPrice) * 100;
    this.grossMargin = this.menuPrice - this.costPerServing;
  }

  this.lastUpdated = new Date();
  next();
});

export const Recipe = mongoose.models.Recipe || mongoose.model('Recipe', recipeSchema);