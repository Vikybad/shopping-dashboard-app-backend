const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const InventoryMovement = require('../models/InventoryMovement');
const auth = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/error');
const { escapeRegex, nonNegativeNumber, optionalString, requiredString } = require('../utils/validation');

const router = express.Router();
router.use(auth);

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = { userId: req.user.id };
  if (req.query.status) filter.status = req.query.status;
  else filter.status = { $ne: 'ARCHIVED' };
  if (req.query.search) {
    const search = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
    filter.$or = [{ name: search }, { sku: search }, { category: search }];
  }
  if (req.query.stock === 'low') filter.$expr = { $lte: ['$stock', '$reorderLevel'] };
  if (req.query.stock === 'out') filter.stock = 0;

  const [data, total] = await Promise.all([
    Product.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter),
  ]);
  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const values = {
      userId: req.user.id,
      name: requiredString(req.body.name, 'Product name', { min: 2, max: 120 }),
      sku: requiredString(req.body.sku, 'SKU', { min: 2, max: 40 }).toUpperCase(),
      category: optionalString(req.body.category, 'Category', 60) || 'Uncategorized',
      description: optionalString(req.body.description, 'Description', 500),
      imageUrl: optionalString(req.body.imageUrl, 'Image URL', 500),
      price: nonNegativeNumber(req.body.price, 'Selling price'),
      cost: nonNegativeNumber(req.body.cost, 'Cost price'),
      stock: nonNegativeNumber(req.body.stock, 'Opening stock', { integer: true }),
      reorderLevel: nonNegativeNumber(req.body.reorderLevel ?? 5, 'Reorder level', { integer: true }),
  };
  const session = await mongoose.startSession();
  let product;
  try {
    await session.withTransaction(async () => {
      [product] = await Product.create([values], { session });
      if (product.stock > 0) {
        await InventoryMovement.create([{
          userId: req.user.id,
          productId: product._id,
          type: 'INITIAL',
          quantityChange: product.stock,
          stockBefore: 0,
          stockAfter: product.stock,
          reason: 'Opening stock',
        }], { session });
      }
    });
  } finally {
    await session.endSession();
  }
  res.status(201).json({ data: product });
}));

router.get('/:id/movements', asyncHandler(async (req, res) => {
  const product = await Product.exists({ _id: req.params.id, userId: req.user.id });
  if (!product) throw new ApiError(404, 'Product not found.', 'PRODUCT_NOT_FOUND');
  const data = await InventoryMovement.find({ productId: req.params.id, userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ data });
}));

router.patch('/:id/stock', asyncHandler(async (req, res) => {
  const quantityChange = Number(req.body.quantityChange);
  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    throw new ApiError(400, 'Stock adjustment must be a non-zero whole number.', 'VALIDATION_ERROR');
  }
  const reason = requiredString(req.body.reason, 'Adjustment reason', { min: 3, max: 300 });
  const session = await mongoose.startSession();
  let product;
  try {
    await session.withTransaction(async () => {
      product = await Product.findOne({ _id: req.params.id, userId: req.user.id, status: 'ACTIVE' }).session(session);
      if (!product) throw new ApiError(404, 'Active product not found.', 'PRODUCT_NOT_FOUND');
      if (product.stock + quantityChange < 0) throw new ApiError(409, 'Adjustment would make stock negative.', 'INSUFFICIENT_STOCK');
      const stockBefore = product.stock;
      product.stock += quantityChange;
      await product.save({ session });
      await InventoryMovement.create([{
        userId: req.user.id,
        productId: product._id,
        type: 'ADJUSTMENT',
        quantityChange,
        stockBefore,
        stockAfter: product.stock,
        reason,
      }], { session });
    });
  } finally {
    await session.endSession();
  }
  res.json({ data: product });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const update = {};
  if (req.body.name !== undefined) update.name = requiredString(req.body.name, 'Product name', { min: 2, max: 120 });
  if (req.body.sku !== undefined) update.sku = requiredString(req.body.sku, 'SKU', { min: 2, max: 40 }).toUpperCase();
  if (req.body.category !== undefined) update.category = optionalString(req.body.category, 'Category', 60) || 'Uncategorized';
  if (req.body.description !== undefined) update.description = optionalString(req.body.description, 'Description', 500);
  if (req.body.imageUrl !== undefined) update.imageUrl = optionalString(req.body.imageUrl, 'Image URL', 500);
  if (req.body.price !== undefined) update.price = nonNegativeNumber(req.body.price, 'Selling price');
  if (req.body.cost !== undefined) update.cost = nonNegativeNumber(req.body.cost, 'Cost price');
  if (req.body.reorderLevel !== undefined) update.reorderLevel = nonNegativeNumber(req.body.reorderLevel, 'Reorder level', { integer: true });
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id, status: 'ACTIVE' },
    update,
    { new: true, runValidators: true },
  );
  if (!product) throw new ApiError(404, 'Active product not found.', 'PRODUCT_NOT_FOUND');
  res.json({ data: product });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id, status: 'ACTIVE' },
    { status: 'ARCHIVED' },
    { new: true },
  );
  if (!product) throw new ApiError(404, 'Active product not found.', 'PRODUCT_NOT_FOUND');
  res.status(204).end();
}));

module.exports = router;
