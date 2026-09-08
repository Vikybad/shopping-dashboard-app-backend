const test = require('node:test');
const assert = require('node:assert/strict');
const { getTemplate, parseCsv, toCsv } = require('../services/csvService');
const { parseOrderRows } = require('../services/importService');

test('product and order templates use the accepted import schema', () => {
  const products = parseCsv(Buffer.from(getTemplate('products')), ['name', 'sku', 'price', 'cost', 'stock']);
  const orders = parseCsv(Buffer.from(getTemplate('orders')), ['order_reference', 'customer_name', 'sku', 'quantity']);
  assert.equal(products.length, 2);
  assert.equal(products[0].sku, 'BAG-CLASSIC-01');
  assert.equal(orders.length, 2);
  assert.equal(orders[0].order_reference, orders[1].order_reference);
});

test('CSV exports quote delimiters and neutralize spreadsheet formulas', () => {
  const csv = toCsv(['name', 'note'], [['=HYPERLINK("bad")', 'value,with,commas']]);
  assert.match(csv, /^name,note\r\n/);
  assert.match(csv, /'=[^,]+/);
  assert.match(csv, /"value,with,commas"/);
});

test('multi-line orders are grouped by external reference', () => {
  const groups = parseOrderRows([
    { order_reference: 'WEB-1', customer_name: 'Aarav Sharma', sku: 'SKU-1', quantity: '1' },
    { order_reference: 'WEB-1', customer_name: 'Aarav Sharma', sku: 'SKU-1', quantity: '2' },
  ]);
  assert.equal(groups.size, 1);
  assert.equal(groups.get('WEB-1').items.get('SKU-1'), 3);
});

test('CSV parsing rejects missing headers and empty files', () => {
  assert.throws(() => parseCsv(Buffer.from('name,sku\nWidget,W-1\n'), ['name', 'price']), (error) => error.code === 'INVALID_CSV_HEADERS');
  assert.throws(() => parseCsv(Buffer.from('name,sku\n'), ['name', 'sku']), (error) => error.code === 'EMPTY_CSV');
});
