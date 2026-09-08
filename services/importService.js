const mongoose = require('mongoose');
const InventoryMovement = require('../models/InventoryMovement');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { ApiError } = require('../middleware/error');
const { calculateTotals } = require('./orderDomain');
const { assertEmail, nonNegativeNumber, optionalString, requiredString } = require('../utils/validation');
const createOrderNumber = require('../utils/orderNumber');

function invalidRows(errors) {
  if (errors.length) throw new ApiError(400, 'Some CSV rows are invalid.', 'CSV_VALIDATION_FAILED', errors.slice(0, 50));
}

async function importProducts(userId, records) {
  const errors = [];
  const seen = new Set();
  const values = records.map((row, index) => {
    try {
      const sku = requiredString(row.sku, 'SKU', { min: 2, max: 40 }).toUpperCase();
      if (seen.has(sku)) throw new ApiError(400, `SKU ${sku} appears more than once.`, 'DUPLICATE_SKU');
      seen.add(sku);
      return {
        userId,
        name: requiredString(row.name, 'Product name', { min: 2, max: 120 }),
        sku,
        category: optionalString(row.category, 'Category', 60) || 'Uncategorized',
        price: nonNegativeNumber(row.price, 'Selling price'),
        cost: nonNegativeNumber(row.cost, 'Cost price'),
        stock: nonNegativeNumber(row.stock, 'Opening stock', { integer: true }),
        reorderLevel: nonNegativeNumber(row.reorder_level || 5, 'Reorder level', { integer: true }),
        description: optionalString(row.description, 'Description', 500),
      };
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
      return null;
    }
  }).filter(Boolean);
  invalidRows(errors);

  const existing = await Product.find({ userId, sku: { $in: values.map((item) => item.sku) } }).select('sku').lean();
  if (existing.length) throw new ApiError(409, 'Some SKUs already exist.', 'DUPLICATE_SKU', existing.map((item) => item.sku));

  const session = await mongoose.startSession();
  let products;
  try {
    await session.withTransaction(async () => {
      products = await Product.create(values, { session });
      const movements = products.filter((product) => product.stock > 0).map((product) => ({
        userId,
        productId: product._id,
        type: 'INITIAL',
        quantityChange: product.stock,
        stockBefore: 0,
        stockAfter: product.stock,
        reason: 'CSV opening stock',
      }));
      if (movements.length) await InventoryMovement.create(movements, { session });
    });
  } finally {
    await session.endSession();
  }
  return { rows: records.length, productsCreated: products.length };
}

function parseOrderRows(records) {
  const errors = [];
  const groups = new Map();
  records.forEach((row, index) => {
    try {
      const reference = requiredString(row.order_reference, 'Order reference', { min: 1, max: 80 });
      const sku = requiredString(row.sku, 'SKU', { min: 2, max: 40 }).toUpperCase();
      const quantity = nonNegativeNumber(row.quantity, 'Quantity', { integer: true });
      if (quantity < 1) throw new ApiError(400, 'Quantity must be at least 1.', 'VALIDATION_ERROR');
      const metadata = {
        externalReference: reference,
        customerName: requiredString(row.customer_name, 'Customer name', { min: 2, max: 120 }),
        customerEmail: row.customer_email ? assertEmail(row.customer_email) : undefined,
        customerPhone: optionalString(row.customer_phone, 'Customer phone', 30),
        paymentStatus: (row.payment_status || 'PENDING').toUpperCase(),
        channel: (row.channel || 'ONLINE').toUpperCase(),
        discount: nonNegativeNumber(row.discount || 0, 'Discount'),
        tax: nonNegativeNumber(row.tax || 0, 'Tax'),
        shippingFee: nonNegativeNumber(row.shipping_fee || 0, 'Shipping fee'),
        instructions: optionalString(row.instructions, 'Instructions', 1000),
      };
      if (!['PENDING', 'PAID'].includes(metadata.paymentStatus)) throw new ApiError(400, 'Payment status must be PENDING or PAID.', 'VALIDATION_ERROR');
      if (!['ONLINE', 'STORE', 'MARKETPLACE'].includes(metadata.channel)) throw new ApiError(400, 'Channel must be ONLINE, STORE, or MARKETPLACE.', 'VALIDATION_ERROR');
      if (!groups.has(reference)) groups.set(reference, { ...metadata, items: new Map(), signature: JSON.stringify(metadata) });
      const group = groups.get(reference);
      if (group.signature !== JSON.stringify(metadata)) throw new ApiError(400, `Order-level fields differ for ${reference}.`, 'INCONSISTENT_ORDER');
      group.items.set(sku, (group.items.get(sku) || 0) + quantity);
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
    }
  });
  invalidRows(errors);
  if (groups.size > 100) throw new ApiError(400, 'One import can contain at most 100 orders.', 'CSV_TOO_LARGE');
  return groups;
}

async function importOrders(userId, records) {
  const groups = parseOrderRows(records);
  const references = [...groups.keys()];
  const duplicateOrders = await Order.find({ userId, externalReference: { $in: references } }).select('externalReference').lean();
  if (duplicateOrders.length) throw new ApiError(409, 'Some order references were already imported.', 'DUPLICATE_ORDER_REFERENCE', duplicateOrders.map((order) => order.externalReference));
  const requestedBySku = new Map();
  for (const group of groups.values()) for (const [sku, quantity] of group.items) requestedBySku.set(sku, (requestedBySku.get(sku) || 0) + quantity);

  const session = await mongoose.startSession();
  const orderNumbers = [];
  try {
    await session.withTransaction(async () => {
      orderNumbers.length = 0;
      const products = await Product.find({ userId, sku: { $in: [...requestedBySku.keys()] }, status: 'ACTIVE' }).session(session);
      const productMap = new Map(products.map((product) => [product.sku, product]));
      const missing = [...requestedBySku.keys()].filter((sku) => !productMap.has(sku));
      if (missing.length) throw new ApiError(400, 'Some SKUs are not active inventory products.', 'PRODUCT_UNAVAILABLE', missing);
      for (const [sku, requested] of requestedBySku) {
        if (productMap.get(sku).stock < requested) throw new ApiError(409, `${sku} only has ${productMap.get(sku).stock} units; ${requested} are required.`, 'INSUFFICIENT_STOCK');
      }

      for (const group of groups.values()) {
        const items = [...group.items].map(([sku, quantity]) => {
          const product = productMap.get(sku);
          return { productId: product._id, productName: product.name, sku, quantity, unitPrice: product.price, unitCost: product.cost };
        });
        const totals = calculateTotals(items, group);
        const [order] = await Order.create([{
          userId,
          orderNumber: createOrderNumber(),
          externalReference: group.externalReference,
          customerName: group.customerName,
          customerEmail: group.customerEmail,
          customerPhone: group.customerPhone,
          paymentStatus: group.paymentStatus,
          channel: group.channel,
          instructions: group.instructions,
          items,
          ...totals,
          stockReserved: true,
          statusHistory: [{ status: 'PENDING', changedAt: new Date() }],
        }], { session });
        orderNumbers.push(order.orderNumber);
        for (const item of items) {
          const product = productMap.get(item.sku);
          const stockBefore = product.stock;
          product.stock -= item.quantity;
          await product.save({ session });
          await InventoryMovement.create([{
            userId,
            productId: product._id,
            orderId: order._id,
            type: 'ORDER',
            quantityChange: -item.quantity,
            stockBefore,
            stockAfter: product.stock,
            reason: `CSV order ${order.orderNumber}`,
          }], { session });
        }
      }
    });
  } finally {
    await session.endSession();
  }
  return { rows: records.length, ordersCreated: groups.size, orderNumbers };
}

module.exports = { importOrders, importProducts, parseOrderRows };
