const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const InventoryMovement = require('../models/InventoryMovement');
const auth = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/error');
const { assertTransition, calculateTotals } = require('../services/orderDomain');
const { escapeRegex, nonNegativeNumber, optionalString, requiredString } = require('../utils/validation');

const router = express.Router();
router.use(auth);

function createOrderNumber() {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `ORD-${day}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function parseItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) {
    throw new ApiError(400, 'An order must contain between 1 and 50 items.', 'VALIDATION_ERROR');
  }
  const consolidated = new Map();
  rawItems.forEach((item) => {
    if (!mongoose.isValidObjectId(item.productId)) throw new ApiError(400, 'Every item needs a valid product.', 'VALIDATION_ERROR');
    const quantity = nonNegativeNumber(item.quantity, 'Item quantity', { integer: true });
    if (quantity < 1 || quantity > 10000) throw new ApiError(400, 'Item quantity must be between 1 and 10,000.', 'VALIDATION_ERROR');
    const key = String(item.productId);
    consolidated.set(key, (consolidated.get(key) || 0) + quantity);
  });
  return [...consolidated].map(([productId, quantity]) => ({ productId, quantity }));
}

async function listOrders(req, res) {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = { userId: req.user.id };
  if (req.query.status) filter.deliveryStatus = req.query.status;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
  if (req.query.search) {
    const search = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
    filter.$or = [{ orderNumber: search }, { customerName: search }, { customerEmail: search }];
  }
  if (req.query.from || req.query.to) {
    filter.orderReceiveDate = {};
    if (req.query.from) filter.orderReceiveDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.orderReceiveDate.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }

  const [data, total] = await Promise.all([
    Order.find(filter).sort({ orderReceiveDate: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

router.get('/', asyncHandler(listOrders));
router.get('/get-orders', asyncHandler(listOrders));

router.get('/:id', asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
  if (!order) throw new ApiError(404, 'Order not found.', 'ORDER_NOT_FOUND');
  res.json({ data: order });
}));

async function createOrder(req, res) {
  const requestedItems = parseItems(req.body.items);
  const customerName = requiredString(req.body.customerName, 'Customer name', { min: 2, max: 120 });
  const customerEmail = optionalString(req.body.customerEmail, 'Customer email', 254)?.toLowerCase();
  const customerPhone = optionalString(req.body.customerPhone, 'Customer phone', 30);
  const instructions = optionalString(req.body.instructions, 'Instructions', 1000);
  const paymentStatus = req.body.paymentStatus || 'PENDING';
  const channel = req.body.channel || 'ONLINE';
  if (!['PENDING', 'PAID'].includes(paymentStatus)) throw new ApiError(400, 'New orders can only be pending or paid.', 'VALIDATION_ERROR');
  if (!['ONLINE', 'STORE', 'MARKETPLACE'].includes(channel)) throw new ApiError(400, 'Unknown sales channel.', 'VALIDATION_ERROR');

  const session = await mongoose.startSession();
  let createdOrder;
  try {
    await session.withTransaction(async () => {
      const productIds = requestedItems.map((item) => item.productId);
      const products = await Product.find({ _id: { $in: productIds }, userId: req.user.id, status: 'ACTIVE' }).session(session);
      if (products.length !== productIds.length) throw new ApiError(400, 'One or more selected products are unavailable.', 'PRODUCT_UNAVAILABLE');
      const productMap = new Map(products.map((product) => [String(product._id), product]));

      const items = requestedItems.map(({ productId, quantity }) => {
        const product = productMap.get(productId);
        if (product.stock < quantity) {
          throw new ApiError(409, `${product.name} only has ${product.stock} units available.`, 'INSUFFICIENT_STOCK');
        }
        return { productId: product._id, productName: product.name, sku: product.sku, quantity, unitPrice: product.price, unitCost: product.cost };
      });
      const totals = calculateTotals(items, {
        discount: nonNegativeNumber(req.body.discount || 0, 'Discount'),
        tax: nonNegativeNumber(req.body.tax || 0, 'Tax'),
        shippingFee: nonNegativeNumber(req.body.shippingFee || 0, 'Shipping fee'),
      });

      const [order] = await Order.create([{
        userId: req.user.id,
        orderNumber: createOrderNumber(),
        customerName,
        customerEmail,
        customerPhone,
        instructions,
        paymentStatus,
        channel,
        items,
        ...totals,
        stockReserved: true,
        statusHistory: [{ status: 'PENDING', changedAt: new Date() }],
      }], { session });

      for (const item of items) {
        const product = productMap.get(String(item.productId));
        const result = await Product.updateOne(
          { _id: item.productId, userId: req.user.id, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session },
        );
        if (result.modifiedCount !== 1) throw new ApiError(409, `${product.name} stock changed while placing the order.`, 'STOCK_CONFLICT');
        await InventoryMovement.create([{
          userId: req.user.id,
          productId: item.productId,
          orderId: order._id,
          type: 'ORDER',
          quantityChange: -item.quantity,
          stockBefore: product.stock,
          stockAfter: product.stock - item.quantity,
          reason: `Reserved for ${order.orderNumber}`,
        }], { session });
      }
      createdOrder = order;
    });
  } finally {
    await session.endSession();
  }
  res.status(201).json({ data: createdOrder });
}

router.post('/', asyncHandler(createOrder));
router.post('/add-order', asyncHandler(createOrder));

async function updateStatus(req, res, lookup) {
  const status = String(req.body.deliveryStatus || '').toUpperCase();
  const session = await mongoose.startSession();
  let updatedOrder;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ ...lookup, userId: req.user.id }).session(session);
      if (!order) throw new ApiError(404, 'Order not found.', 'ORDER_NOT_FOUND');
      assertTransition(order.deliveryStatus, status);
      if (order.deliveryStatus === status) {
        updatedOrder = order;
        return;
      }

      if (status === 'CANCELLED' && order.stockReserved) {
        for (const item of order.items) {
          if (!item.productId) continue;
          const product = await Product.findOneAndUpdate(
            { _id: item.productId, userId: req.user.id },
            { $inc: { stock: item.quantity } },
            { new: false, session },
          );
          if (product) {
            await InventoryMovement.create([{
              userId: req.user.id,
              productId: item.productId,
              orderId: order._id,
              type: 'CANCELLATION',
              quantityChange: item.quantity,
              stockBefore: product.stock,
              stockAfter: product.stock + item.quantity,
              reason: `Restocked from cancelled ${order.orderNumber}`,
            }], { session });
          }
        }
        order.stockReserved = false;
      }

      order.deliveryStatus = status;
      if (status === 'SHIPPED') order.shippedAt = new Date();
      if (status === 'DELIVERED') order.orderDeliveredOnDate = new Date();
      order.statusHistory.push({ status, changedAt: new Date() });
      updatedOrder = await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  res.json({ data: updatedOrder });
}

router.patch('/:id/status', asyncHandler((req, res) => updateStatus(req, res, { _id: req.params.id })));
router.patch('/:id', asyncHandler((req, res) => updateStatus(req, res, { _id: req.params.id })));
router.post('/orderNumber/:orderNumber', asyncHandler((req, res) => updateStatus(req, res, { orderNumber: req.params.orderNumber })));

module.exports = router;
