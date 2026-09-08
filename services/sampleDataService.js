const mongoose = require('mongoose');
const InventoryMovement = require('../models/InventoryMovement');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Task = require('../models/Tasks');
const { ApiError } = require('../middleware/error');
const { calculateTotals, roundMoney } = require('./orderDomain');
const customers = require('../sample-data/customers.json');
const orderConfig = require('../sample-data/orders.json');
const products = require('../sample-data/products.json');
const tasks = require('../sample-data/tasks.json');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const STATUS_CHAINS = {
  PENDING: ['PENDING'],
  CONFIRMED: ['PENDING', 'CONFIRMED'],
  PROCESSING: ['PENDING', 'CONFIRMED', 'PROCESSING'],
  SHIPPED: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'],
  DELIVERED: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
  CANCELLED: ['PENDING', 'CANCELLED'],
};

function validateFixtures() {
  const requiredArrays = [products, customers, tasks, orderConfig.statuses, orderConfig.channels, orderConfig.itemsPerOrder, orderConfig.quantities];
  if (requiredArrays.some((value) => !Array.isArray(value) || value.length === 0)) {
    throw new Error('Sample data fixtures must contain non-empty arrays.');
  }
  if (!Number.isSafeInteger(orderConfig.count) || orderConfig.count < 1 || !Number.isSafeInteger(orderConfig.historyDays) || orderConfig.historyDays < 1) {
    throw new Error('Sample order configuration is invalid.');
  }
  const skus = new Set(products.map((product) => product.sku));
  if (skus.size !== products.length) throw new Error('Sample product SKUs must be unique.');
  if (orderConfig.statuses.some((status) => !STATUS_CHAINS[status])) throw new Error('Sample order configuration contains an unknown status.');
}

validateFixtures();

function cycle(values, index) {
  return values[index % values.length];
}

function buildSampleDataset(userId, productDocs, now = new Date()) {
  const currentStock = new Map(productDocs.map((product) => [product._id.toString(), product.stock]));
  const targetStockBySku = new Map(products.filter((product) => Number.isFinite(product.targetStock)).map((product) => [product.sku, product.targetStock]));
  const orderStamp = now.toISOString().slice(0, 10).replaceAll('-', '');
  const orders = [];
  const movements = [];

  for (let index = 0; index < orderConfig.count; index += 1) {
    const status = cycle(orderConfig.statuses, index);
    const customer = cycle(customers, index * 5 + Math.floor(index / customers.length));
    const itemCount = cycle(orderConfig.itemsPerOrder, index);
    const items = [];

    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const product = productDocs[(index * 11 + itemIndex * 17) % productDocs.length];
      const quantity = cycle(orderConfig.quantities, index + itemIndex * 3);
      const stockKey = product._id.toString();
      const stockBefore = currentStock.get(stockKey);
      if (status !== 'CANCELLED' && stockBefore < quantity) {
        throw new Error(`Sample fixture exhausted stock for ${product.sku}.`);
      }
      items.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        quantity,
        unitPrice: product.price,
        unitCost: product.cost,
      });
    }

    const daysAgo = index % orderConfig.historyDays;
    const orderDate = new Date(now.getTime() - daysAgo * DAY_MS - (12 + (index * 5) % 10) * HOUR_MS);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const discount = Math.min(cycle(orderConfig.discounts, index), subtotal);
    const tax = roundMoney((subtotal - discount) * cycle(orderConfig.taxRates, index));
    const totals = calculateTotals(items, { discount, tax, shippingFee: cycle(orderConfig.shippingFees, index) });
    const history = STATUS_CHAINS[status].map((value, step) => ({ status: value, changedAt: new Date(orderDate.getTime() + step * 2 * HOUR_MS) }));
    const orderId = new mongoose.Types.ObjectId();
    const orderNumber = `SMP-${orderStamp}-${String(index + 1).padStart(4, '0')}`;

    orders.push({
      _id: orderId,
      userId,
      orderNumber,
      externalReference: `SAMPLE-${orderStamp}-${String(index + 1).padStart(4, '0')}`,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      paymentStatus: status === 'CANCELLED' ? 'REFUNDED' : status === 'PENDING' ? 'PENDING' : 'PAID',
      channel: cycle(orderConfig.channels, index),
      items,
      ...totals,
      orderReceiveDate: orderDate,
      deliveryStatus: status,
      shippedAt: ['SHIPPED', 'DELIVERED'].includes(status) ? history.find((item) => item.status === 'SHIPPED').changedAt : undefined,
      orderDeliveredOnDate: status === 'DELIVERED' ? history.at(-1).changedAt : undefined,
      instructions: cycle(orderConfig.instructions, index),
      stockReserved: status !== 'CANCELLED',
      statusHistory: history,
      createdAt: orderDate,
      updatedAt: history.at(-1).changedAt,
    });

    if (status !== 'CANCELLED') {
      for (const item of items) {
        const stockKey = item.productId.toString();
        const stockBefore = currentStock.get(stockKey);
        const stockAfter = stockBefore - item.quantity;
        currentStock.set(stockKey, stockAfter);
        movements.push({
          userId,
          productId: item.productId,
          orderId,
          type: 'ORDER',
          quantityChange: -item.quantity,
          stockBefore,
          stockAfter,
          reason: `Sample order ${orderNumber}`,
          createdAt: orderDate,
          updatedAt: orderDate,
        });
      }
    }
  }

  for (const product of productDocs) {
    const targetStock = targetStockBySku.get(product.sku);
    if (targetStock === undefined) continue;
    const stockKey = product._id.toString();
    const stockBefore = currentStock.get(stockKey);
    if (stockBefore <= targetStock) continue;
    currentStock.set(stockKey, targetStock);
    movements.push({
      userId,
      productId: product._id,
      type: 'ADJUSTMENT',
      quantityChange: targetStock - stockBefore,
      stockBefore,
      stockAfter: targetStock,
      reason: 'Sample stocktake adjustment',
      createdAt: now,
      updatedAt: now,
    });
  }

  return { orders, movements, currentStock };
}

async function createSampleData(userId) {
  const [productCount, orderCount, taskCount, movementCount] = await Promise.all([
    Product.countDocuments({ userId }),
    Order.countDocuments({ userId }),
    Task.countDocuments({ userId }),
    InventoryMovement.countDocuments({ userId }),
  ]);
  if (productCount || orderCount || taskCount || movementCount) {
    throw new ApiError(409, 'Sample data can only be added to an empty account.', 'ACCOUNT_NOT_EMPTY');
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const productDocs = await Product.insertMany(products.map(({ openingStock, targetStock, ...product }) => ({
        ...product,
        userId,
        stock: openingStock,
      })), { session, ordered: true });

      const initialMovementDate = new Date(now.getTime() - (orderConfig.historyDays + 1) * DAY_MS);
      const initialMovements = productDocs.map((product) => ({
        userId,
        productId: product._id,
        type: 'INITIAL',
        quantityChange: product.stock,
        stockBefore: 0,
        stockAfter: product.stock,
        reason: 'Sample opening stock',
        createdAt: initialMovementDate,
        updatedAt: initialMovementDate,
      }));
      const dataset = buildSampleDataset(userId, productDocs, now);

      await Order.insertMany(dataset.orders, { session, ordered: true });
      await InventoryMovement.insertMany([...initialMovements, ...dataset.movements], { session, ordered: true });
      await Product.bulkWrite(productDocs.map((product) => ({
        updateOne: {
          filter: { _id: product._id, userId },
          update: { $set: { stock: dataset.currentStock.get(product._id.toString()) } },
        },
      })), { session, ordered: true });
      const taskDocs = await Task.insertMany(tasks.map((task) => ({ ...task, userId })), { session, ordered: true });

      result = {
        productsCreated: productDocs.length,
        ordersCreated: dataset.orders.length,
        tasksCreated: taskDocs.length,
        inventoryMovementsCreated: initialMovements.length + dataset.movements.length,
      };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

module.exports = createSampleData;
module.exports.buildSampleDataset = buildSampleDataset;
module.exports.fixtures = { customers, orderConfig, products, tasks };
