const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  category: { type: String, trim: true, default: 'Uncategorized', maxlength: 60 },
  description: { type: String, trim: true, maxlength: 500 },
  price: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  reorderLevel: { type: Number, required: true, min: 0, default: 5 },
  status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE', index: true },
  imageUrl: { type: String, trim: true },
}, { timestamps: true });

ProductSchema.index({ userId: 1, sku: 1 }, { unique: true });
ProductSchema.index({ userId: 1, stock: 1 });

module.exports = mongoose.model('Product', ProductSchema);
