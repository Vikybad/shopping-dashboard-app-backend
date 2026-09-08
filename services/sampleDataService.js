const mongoose = require('mongoose');
const InventoryMovement = require('../models/InventoryMovement');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Task = require('../models/Tasks');
const { ApiError } = require('../middleware/error');
const { calculateTotals } = require('./orderDomain');
const createOrderNumber = require('../utils/orderNumber');

const products = [
  ['Classic Backpack', 'DEMO-BAG-01', 'Bags', 2499, 1350, 36, 8],
  ['Wireless Mouse', 'DEMO-TECH-01', 'Electronics', 1299, 720, 48, 10],
  ['Steel Bottle', 'DEMO-HOME-01', 'Home', 799, 380, 28, 6],
  ['Everyday Sneakers', 'DEMO-SHOE-01', 'Footwear', 3199, 1800, 22, 5],
  ['Cotton T-shirt', 'DEMO-TEE-01', 'Apparel', 999, 430, 54, 12],
  ['Desk Organizer', 'DEMO-DESK-01', 'Office', 649, 290, 17, 5],
  ['Travel Pouch', 'DEMO-TRAVEL-01', 'Travel', 549, 240, 3, 5],
  ['USB-C Cable', 'DEMO-CABLE-01', 'Electronics', 449, 165, 64, 15],
];

const customers = ['Aarav Sharma', 'Diya Patel', 'Kabir Mehta', 'Isha Verma', 'Rohan Gupta', 'Mira Nair'];
const statuses = ['DELIVERED', 'DELIVERED', 'SHIPPED', 'PROCESSING', 'CONFIRMED', 'PENDING', 'CANCELLED'];
const chains = {
  PENDING: ['PENDING'],
  CONFIRMED: ['PENDING', 'CONFIRMED'],
  PROCESSING: ['PENDING', 'CONFIRMED', 'PROCESSING'],
  SHIPPED: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'],
  DELIVERED: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
  CANCELLED: ['PENDING', 'CANCELLED'],
};

async function createSampleData(userId) {
  const [productCount, orderCount, taskCount] = await Promise.all([
    Product.countDocuments({ userId }),
    Order.countDocuments({ userId }),
    Task.countDocuments({ userId }),
  ]);
  if (productCount || orderCount || taskCount) throw new ApiError(409, 'Sample data can only be added to an empty account.', 'ACCOUNT_NOT_EMPTY');

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const productDocs = await Product.create(products.map(([name, sku, category, price, cost, stock, reorderLevel]) => ({ userId, name, sku, category, price, cost, stock, reorderLevel, description: 'Sample catalogue product' })), { session });
      await InventoryMovement.create(productDocs.map((product) => ({ userId, productId: product._id, type: 'INITIAL', quantityChange: product.stock, stockBefore: 0, stockAfter: product.stock, reason: 'Sample opening stock' })), { session });

      const orderDocs = [];
      for (let index = 0; index < 18; index += 1) {
        const product = productDocs[index % productDocs.length];
        const quantity = (index % 3) + 1;
        const status = statuses[index % statuses.length];
        const orderDate = new Date(Date.now() - (index * 36 * 60 * 60 * 1000));
        const items = [{ productId: product._id, productName: product.name, sku: product.sku, quantity, unitPrice: product.price, unitCost: product.cost }];
        const totals = calculateTotals(items, { shippingFee: index % 4 === 0 ? 80 : 0, discount: index % 5 === 0 ? 100 : 0 });
        const history = chains[status].map((value, step) => ({ status: value, changedAt: new Date(orderDate.getTime() + step * 6 * 60 * 60 * 1000) }));
        const [order] = await Order.create([{
          userId,
          orderNumber: createOrderNumber(),
          externalReference: `SAMPLE-${String(index + 1).padStart(3, '0')}`,
          customerName: customers[index % customers.length],
          customerEmail: `sample.customer${(index % customers.length) + 1}@example.com`,
          paymentStatus: status === 'CANCELLED' || status === 'PENDING' ? 'PENDING' : 'PAID',
          channel: ['ONLINE', 'STORE', 'MARKETPLACE'][index % 3],
          items,
          ...totals,
          orderReceiveDate: orderDate,
          deliveryStatus: status,
          shippedAt: ['SHIPPED', 'DELIVERED'].includes(status) ? history.find((item) => item.status === 'SHIPPED')?.changedAt : undefined,
          orderDeliveredOnDate: status === 'DELIVERED' ? history.at(-1).changedAt : undefined,
          stockReserved: status !== 'CANCELLED',
          statusHistory: history,
        }], { session });
        orderDocs.push(order);
        if (status !== 'CANCELLED') {
          const stockBefore = product.stock;
          product.stock -= quantity;
          await product.save({ session });
          await InventoryMovement.create([{
            userId, productId: product._id, orderId: order._id, type: 'ORDER', quantityChange: -quantity,
            stockBefore, stockAfter: product.stock, reason: `Sample order ${order.orderNumber}`,
          }], { session });
        }
      }
      await Task.create([
        { userId, taskName: 'Review products below reorder level' },
        { userId, taskName: 'Confirm pending customer orders' },
        { userId, taskName: 'Reconcile this week’s delivered revenue', completed: true },
      ], { session });
      result = { productsCreated: productDocs.length, ordersCreated: orderDocs.length, tasksCreated: 3 };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

module.exports = createSampleData;
