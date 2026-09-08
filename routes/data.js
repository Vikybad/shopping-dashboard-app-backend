const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Order = require('../models/Order');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/error');
const { ORDER_HEADERS, PRODUCT_HEADERS, getTemplate, parseCsv, toCsv } = require('../services/csvService');
const { importOrders, importProducts } = require('../services/importService');
const createSampleData = require('../services/sampleDataService');
const { deleteOperationalData, verifyAccountPassword } = require('../services/accountDataService');

const router = express.Router();
router.use(auth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (file.originalname.toLowerCase().endsWith('.csv') || ['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype)) return callback(null, true);
    return callback(new ApiError(400, 'Upload a .csv file.', 'INVALID_FILE_TYPE'));
  },
});

function csvUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error) return next(error instanceof ApiError ? error : new ApiError(400, error.message, 'CSV_UPLOAD_FAILED'));
    if (!req.file) return next(new ApiError(400, 'Choose a CSV file to upload.', 'FILE_REQUIRED'));
    return next();
  });
}

function sendCsv(res, filename, contents) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(contents);
}

router.get('/templates/:type', (req, res, next) => {
  try { sendCsv(res, `${req.params.type}-template.csv`, getTemplate(req.params.type)); }
  catch (error) { next(error); }
});

router.post('/import/products', csvUpload, asyncHandler(async (req, res) => {
  const records = parseCsv(req.file.buffer, ['name', 'sku', 'price', 'cost', 'stock']);
  res.status(201).json({ data: await importProducts(req.user.id, records) });
}));

router.post('/import/orders', csvUpload, asyncHandler(async (req, res) => {
  const records = parseCsv(req.file.buffer, ['order_reference', 'customer_name', 'sku', 'quantity']);
  res.status(201).json({ data: await importOrders(req.user.id, records) });
}));

router.get('/export/products', asyncHandler(async (req, res) => {
  const products = await Product.find({ userId: req.user.id, status: 'ACTIVE' }).sort({ name: 1 }).lean();
  const rows = products.map((product) => [product.name, product.sku, product.category, product.price, product.cost, product.stock, product.reorderLevel, product.description, product.status]);
  sendCsv(res, `shopboard-products-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([...PRODUCT_HEADERS, 'status'], rows));
}));

router.get('/export/orders', asyncHandler(async (req, res) => {
  const orders = await Order.find({ userId: req.user.id }).sort({ orderReceiveDate: -1 }).lean();
  const headers = [...ORDER_HEADERS, 'shopboard_order_number', 'delivery_status', 'order_date', 'unit_price', 'total_amount'];
  const rows = orders.flatMap((order) => {
    const items = order.items?.length ? order.items : [{ sku: '', quantity: 1, unitPrice: order.soldAtAmount || 0 }];
    return items.map((item) => [
      order.externalReference || order.orderNumber, order.customerName, order.customerEmail, order.customerPhone, item.sku,
      item.quantity, order.paymentStatus, order.channel, order.discount, order.tax, order.shippingFee, order.instructions,
      order.orderNumber, order.deliveryStatus, new Date(order.orderReceiveDate).toISOString(), item.unitPrice, order.totalAmount ?? order.soldAtAmount,
    ]);
  });
  sendCsv(res, `shopboard-orders-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
}));

router.post('/sample', asyncHandler(async (req, res) => {
  res.status(201).json({ data: await createSampleData(req.user.id) });
}));

router.delete('/reset', asyncHandler(async (req, res) => {
  if (req.body.confirmation !== 'RESET MY DATA') throw new ApiError(400, 'Type RESET MY DATA to confirm.', 'CONFIRMATION_REQUIRED');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await verifyAccountPassword(req.user.id, req.body.password, session);
      await deleteOperationalData(req.user.id, session);
    });
  } finally { await session.endSession(); }
  res.json({ message: 'All orders, products, stock history, and tasks were deleted.' });
}));

module.exports = router;
