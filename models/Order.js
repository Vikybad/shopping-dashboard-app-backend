const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerName: { type: String, required: true, trim: true },
  customerEmail: { type: String, trim: true, lowercase: true },
  customerPhone: { type: String, trim: true },
  customerImage: { type: String },
  orderNumber: { type: String, required: true },
  orderReceiveDate: { type: Date, default: Date.now },
  orderDeliveredOnDate: { type: Date },
  shippedAt: { type: Date },
  deliveryStatus: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    default: 'PENDING',
    index: true,
  },
  paymentStatus: { type: String, enum: ['PENDING', 'PAID', 'REFUNDED', 'FAILED'], default: 'PENDING' },
  channel: { type: String, enum: ['ONLINE', 'STORE', 'MARKETPLACE'], default: 'ONLINE' },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
  }],
  subtotal: { type: Number, required: true, min: 0, default: 0 },
  discount: { type: Number, required: true, min: 0, default: 0 },
  tax: { type: Number, required: true, min: 0, default: 0 },
  shippingFee: { type: Number, required: true, min: 0, default: 0 },
  totalAmount: { type: Number, required: true, min: 0, default: 0 },
  costTotal: { type: Number, required: true, min: 0, default: 0 },
  actualAmount: { type: Number, min: 0 },
  soldAtAmount: { type: Number, min: 0 },
  dishName: { type: String, trim: true },
  instructions: { type: String },
  stockReserved: { type: Boolean, default: false },
  statusHistory: [{
    status: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

OrderSchema.index({ userId: 1, orderNumber: 1 }, { unique: true });
OrderSchema.index({ userId: 1, orderReceiveDate: -1 });

module.exports = mongoose.model('Order', OrderSchema);
