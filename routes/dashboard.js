const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');

const router = express.Router();
router.use(auth);

function startOfDay(date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function percentageChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

router.get('/overview', asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.id);
  const today = startOfDay(new Date());
  const currentStart = new Date(today);
  currentStart.setUTCDate(currentStart.getUTCDate() - 29);
  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - 30);
  const trendStart = new Date(today);
  trendStart.setUTCDate(trendStart.getUTCDate() - 13);

  const [allSummary, periodSummary, statusRows, trendRows, recentOrders, lowStock, inventorySummary, topProducts] = await Promise.all([
    Order.aggregate([
      { $match: { userId } },
      { $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        deliveredOrders: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'DELIVERED'] }, 1, 0] } },
        revenue: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'DELIVERED'] }, { $ifNull: ['$totalAmount', '$soldAtAmount'] }, 0] } },
        cost: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'DELIVERED'] }, { $ifNull: ['$costTotal', '$actualAmount'] }, 0] } },
      } },
    ]),
    Order.aggregate([
      { $match: { userId, orderReceiveDate: { $gte: previousStart } } },
      { $group: {
        _id: { $cond: [{ $gte: ['$orderReceiveDate', currentStart] }, 'current', 'previous'] },
        orders: { $sum: 1 },
        revenue: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'DELIVERED'] }, { $ifNull: ['$totalAmount', '$soldAtAmount'] }, 0] } },
      } },
    ]),
    Order.aggregate([{ $match: { userId } }, { $group: { _id: '$deliveryStatus', value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
    Order.aggregate([
      { $match: { userId, orderReceiveDate: { $gte: trendStart }, deliveryStatus: { $ne: 'CANCELLED' } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$orderReceiveDate' } }, revenue: { $sum: { $ifNull: ['$totalAmount', '$soldAtAmount'] } }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Order.find({ userId }).sort({ orderReceiveDate: -1 }).limit(6).lean(),
    Product.find({ userId, status: 'ACTIVE', $expr: { $lte: ['$stock', '$reorderLevel'] } }).sort({ stock: 1 }).limit(6).lean(),
    Product.aggregate([
      { $match: { userId, status: 'ACTIVE' } },
      { $group: { _id: null, products: { $sum: 1 }, units: { $sum: '$stock' }, retailValue: { $sum: { $multiply: ['$stock', '$price'] } }, costValue: { $sum: { $multiply: ['$stock', '$cost'] } } } },
    ]),
    Order.aggregate([
      { $match: { userId, deliveryStatus: { $ne: 'CANCELLED' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.sku', name: { $first: '$items.productName' }, units: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } } } },
      { $sort: { units: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const summary = allSummary[0] || { totalOrders: 0, deliveredOrders: 0, revenue: 0, cost: 0 };
  const current = periodSummary.find((row) => row._id === 'current') || { orders: 0, revenue: 0 };
  const previous = periodSummary.find((row) => row._id === 'previous') || { orders: 0, revenue: 0 };
  const trendMap = new Map(trendRows.map((row) => [row._id, row]));
  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(trendStart);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { date: key, revenue: trendMap.get(key)?.revenue || 0, orders: trendMap.get(key)?.orders || 0 };
  });

  res.json({
    data: {
      summary: {
        totalOrders: summary.totalOrders,
        deliveredOrders: summary.deliveredOrders,
        revenue: summary.revenue,
        profit: summary.revenue - summary.cost,
        averageOrderValue: summary.deliveredOrders ? summary.revenue / summary.deliveredOrders : 0,
        fulfilmentRate: summary.totalOrders ? (summary.deliveredOrders / summary.totalOrders) * 100 : 0,
        orderChange: percentageChange(current.orders, previous.orders),
        revenueChange: percentageChange(current.revenue, previous.revenue),
      },
      statusDistribution: statusRows.map((row) => ({ status: row._id, value: row.value })),
      trend,
      recentOrders,
      lowStock,
      inventory: inventorySummary[0] || { products: 0, units: 0, retailValue: 0, costValue: 0 },
      topProducts,
    },
  });
}));

module.exports = router;
