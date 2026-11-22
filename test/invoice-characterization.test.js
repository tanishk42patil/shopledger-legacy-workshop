const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

function inMemoryOrder() {
  const items = [{
    id: 1,
    sku: 'RICE-1',
    name: 'Rice',
    hsn: '1006',
    price: 500,
    qty: 1
  }];
  const totals = pricing.computeTotals(items, 'SAVE10');

  return {
    id: 1234,
    date: '2026-11-22',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items,
    coupon: 'SAVE10',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('CURRENT BEHAVIOUR: pricing uses the HSN slab and discounts subtotal before tax', () => {
  const order = inMemoryOrder();
  const totals = pricing.computeTotals(order.items, order.coupon);

  assert.deepEqual({
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxable: totals.taxable,
    tax: totals.tax,
    cgst: totals.cgst,
    sgst: totals.sgst,
    total: totals.total,
    lineGstPercent: totals.lines[0].gstPercent
  }, {
    subtotal: 500,
    discount: 50,
    taxable: 450,
    tax: 22.5,
    cgst: 11.25,
    sgst: 11.25,
    total: 472.5,
    lineGstPercent: 5
  });
});

test('Invoice figures match the GST breakdown and total used to bill the order', () => {
  const order = inMemoryOrder();
  const billed = pricing.computeTotals(order.items, order.coupon);
  const figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual({
    subtotal: figures.subtotal,
    discount: figures.discount,
    tax: figures.tax,
    cgst: figures.cgst,
    sgst: figures.sgst,
    total: figures.total,
    line: figures.rows[0].line,
    lineDiscount: figures.rows[0].discount,
    lineTaxable: figures.rows[0].taxable,
    lineTax: figures.rows[0].lineTax,
    lineGstPercent: figures.rows[0].gstPercent
  }, {
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    cgst: billed.cgst,
    sgst: billed.sgst,
    total: order.total,
    line: billed.lines[0].gross,
    lineDiscount: billed.lines[0].discount,
    lineTaxable: billed.lines[0].taxable,
    lineTax: billed.lines[0].tax,
    lineGstPercent: billed.lines[0].gstPercent
  });

  const html = invoice.render(order);
  assert.match(html, /<td>CGST<\/td><td class="r">₹11\.25<\/td>/);
  assert.match(html, /<td>SGST<\/td><td class="r">₹11\.25<\/td>/);
});

test('GST reconciliation reports matching invoice and ledger figures', () => {
  const order = inMemoryOrder();
  const result = reports.getGstReconciliation({
    orders: [order],
    products: [],
    customers: []
  });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.deepEqual({
    ledgerTax: result.rows[0].ledgerTax,
    invoiceTax: result.rows[0].invoiceTax,
    ledgerTotal: result.rows[0].ledgerTotal,
    invoiceTotal: result.rows[0].invoiceTotal,
    delta: result.rows[0].delta,
    matched: result.rows[0].matched
  }, {
    ledgerTax: 22.5,
    invoiceTax: 22.5,
    ledgerTotal: 472.5,
    invoiceTotal: 472.5,
    delta: 0,
    matched: true
  });
});
