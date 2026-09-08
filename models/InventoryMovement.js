const mongoose = require('mongoose');

const InventoryMovementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  type: { type: String, enum: ['INITIAL', 'ADJUSTMENT', 'ORDER', 'CANCELLATION'], required: true },
  quantityChange: { type: Number, required: true },
  stockBefore: { type: Number, required: true, min: 0 },
  stockAfter: { type: Number, required: true, min: 0 },
  reason: { type: String, trim: true, maxlength: 300 },
}, { timestamps: true });

InventoryMovementSchema.index({ userId: 1, productId: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryMovement', InventoryMovementSchema);
