const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedTransitions, assertTransition, calculateTotals } = require('../services/orderDomain');

test('calculates authoritative order totals from inventory snapshots', () => {
  const result = calculateTotals([
    { unitPrice: 199.5, unitCost: 120, quantity: 2 },
    { unitPrice: 50, unitCost: 25, quantity: 1 },
  ], { discount: 20, tax: 18, shippingFee: 30 });

  assert.deepEqual(result, {
    subtotal: 449,
    costTotal: 265,
    discount: 20,
    tax: 18,
    shippingFee: 30,
    totalAmount: 477,
  });
});

test('rejects a discount greater than subtotal', () => {
  assert.throws(
    () => calculateTotals([{ unitPrice: 10, unitCost: 5, quantity: 1 }], { discount: 11 }),
    (error) => error.code === 'VALIDATION_ERROR' && error.status === 400,
  );
});

test('only allows forward fulfilment transitions and pre-shipment cancellation', () => {
  assert.deepEqual(allowedTransitions('PENDING'), ['CONFIRMED', 'CANCELLED']);
  assert.doesNotThrow(() => assertTransition('PROCESSING', 'SHIPPED'));
  assert.throws(
    () => assertTransition('DELIVERED', 'PENDING'),
    (error) => error.code === 'INVALID_STATUS_TRANSITION' && error.status === 409,
  );
});
