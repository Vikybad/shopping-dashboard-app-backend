const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { buildSampleDataset, fixtures } = require('../services/sampleDataService');

test('large sample fixtures build a consistent operational dataset', () => {
  const userId = new mongoose.Types.ObjectId();
  const productDocs = fixtures.products.map(({ openingStock, targetStock, ...product }) => ({
    ...product,
    _id: new mongoose.Types.ObjectId(),
    stock: openingStock,
  }));
  const dataset = buildSampleDataset(userId, productDocs, new Date('2026-09-08T12:00:00.000Z'));

  assert.ok(fixtures.products.length >= 40);
  assert.ok(fixtures.customers.length >= 20);
  assert.ok(fixtures.tasks.length >= 10);
  assert.equal(dataset.orders.length, 320);
  assert.equal(new Set(dataset.orders.map((order) => order.orderNumber)).size, dataset.orders.length);
  assert.ok(dataset.movements.length > dataset.orders.length);
  assert.ok(dataset.orders.every((order) => order.items.length >= 1 && order.statusHistory.at(-1).status === order.deliveryStatus));
  assert.ok([...dataset.currentStock.values()].every((stock) => stock >= 0));

  for (const product of productDocs) {
    const movementTotal = dataset.movements
      .filter((movement) => movement.productId.equals(product._id))
      .reduce((total, movement) => total + movement.quantityChange, 0);
    assert.equal(dataset.currentStock.get(product._id.toString()), product.stock + movementTotal);
  }

  const lowStockProducts = productDocs.filter((product) => (
    dataset.currentStock.get(product._id.toString()) <= product.reorderLevel
  ));
  assert.ok(lowStockProducts.length >= 5);
});
