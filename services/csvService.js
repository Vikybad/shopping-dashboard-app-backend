const { parse } = require('csv-parse/sync');
const { ApiError } = require('../middleware/error');

const PRODUCT_HEADERS = ['name', 'sku', 'category', 'price', 'cost', 'stock', 'reorder_level', 'description'];
const ORDER_HEADERS = ['order_reference', 'customer_name', 'customer_email', 'customer_phone', 'sku', 'quantity', 'payment_status', 'channel', 'discount', 'tax', 'shipping_fee', 'instructions'];

const templates = {
  products: [
    PRODUCT_HEADERS,
    ['Classic Backpack', 'BAG-CLASSIC-01', 'Bags', '2499', '1350', '25', '5', 'Water-resistant everyday backpack'],
    ['Wireless Mouse', 'TECH-MOUSE-01', 'Electronics', '1299', '720', '40', '8', 'Ergonomic wireless mouse'],
  ],
  orders: [
    ORDER_HEADERS,
    ['WEB-1001', 'Aarav Sharma', 'aarav@example.com', '9876543210', 'BAG-CLASSIC-01', '1', 'PAID', 'ONLINE', '100', '0', '80', 'Leave at reception'],
    ['WEB-1001', 'Aarav Sharma', 'aarav@example.com', '9876543210', 'TECH-MOUSE-01', '2', 'PAID', 'ONLINE', '100', '0', '80', 'Leave at reception'],
  ],
};

function csvCell(value) {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function getTemplate(type) {
  const rows = templates[type];
  if (!rows) throw new ApiError(404, 'CSV template not found.', 'TEMPLATE_NOT_FOUND');
  return toCsv(rows[0], rows.slice(1));
}

function parseCsv(buffer, requiredHeaders) {
  let records;
  try {
    records = parse(buffer, { columns: true, bom: true, skip_empty_lines: true, trim: true, relax_column_count: false });
  } catch (error) {
    throw new ApiError(400, `CSV could not be parsed: ${error.message}`, 'INVALID_CSV');
  }
  if (!records.length) throw new ApiError(400, 'CSV contains no data rows.', 'EMPTY_CSV');
  if (records.length > 500) throw new ApiError(400, 'CSV imports are limited to 500 rows.', 'CSV_TOO_LARGE');
  const headers = Object.keys(records[0]);
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new ApiError(400, `CSV is missing required columns: ${missing.join(', ')}.`, 'INVALID_CSV_HEADERS');
  return records;
}

module.exports = { ORDER_HEADERS, PRODUCT_HEADERS, csvCell, getTemplate, parseCsv, toCsv };
