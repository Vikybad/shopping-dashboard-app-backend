const { ApiError } = require('../middleware/error');

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

function allowedTransitions(status) {
  return TRANSITIONS[status] || [];
}

function assertTransition(from, to) {
  if (!ORDER_STATUSES.includes(to)) {
    throw new ApiError(400, 'Unknown order status.', 'INVALID_STATUS');
  }
  if (from === to) return;
  if (!allowedTransitions(from).includes(to)) {
    throw new ApiError(409, `An order cannot move from ${from} to ${to}.`, 'INVALID_STATUS_TRANSITION');
  }
}

function calculateTotals(items, { discount = 0, tax = 0, shippingFee = 0 } = {}) {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const costTotal = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
  const safeDiscount = Number(discount) || 0;
  const safeTax = Number(tax) || 0;
  const safeShipping = Number(shippingFee) || 0;
  if ([safeDiscount, safeTax, safeShipping].some((value) => value < 0)) {
    throw new ApiError(400, 'Discount, tax, and shipping fee cannot be negative.', 'VALIDATION_ERROR');
  }
  if (safeDiscount > subtotal) {
    throw new ApiError(400, 'Discount cannot exceed the subtotal.', 'VALIDATION_ERROR');
  }
  return {
    subtotal: roundMoney(subtotal),
    costTotal: roundMoney(costTotal),
    discount: roundMoney(safeDiscount),
    tax: roundMoney(safeTax),
    shippingFee: roundMoney(safeShipping),
    totalAmount: roundMoney(subtotal - safeDiscount + safeTax + safeShipping),
  };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = { ORDER_STATUSES, allowedTransitions, assertTransition, calculateTotals, roundMoney };
