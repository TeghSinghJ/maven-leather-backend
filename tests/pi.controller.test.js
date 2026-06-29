const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeBatchInfoForQty, resolveUpdatedItemQty } = require('../src/controllers/pi.controller');

test('normalizeBatchInfoForQty trims merged hide allocations to the item quantity', () => {
  const batchInfo = [
    { hide_id: 'H1', batch_no: 'B1', qty: 40 },
    { hide_id: 'H1', batch_no: 'B1', qty: 20 },
    { hide_id: 'H2', batch_no: 'B2', qty: 10 },
  ];

  const normalized = normalizeBatchInfoForQty(batchInfo, 50);
  const totalQty = normalized.reduce((sum, batch) => sum + Number(batch.qty || 0), 0);

  assert.equal(totalQty, 50);
  assert.equal(normalized[0].hide_id, 'H1');
  assert.equal(normalized[0].qty, 40);
  assert.equal(normalized[1].hide_id, 'H2');
  assert.equal(normalized[1].qty, 10);
});

test('normalizeBatchInfoForQty trims an already doubled allocation back to the requested item quantity', () => {
  const batchInfo = [
    { hide_id: 'H1', batch_no: 'B1', qty: 3872 },
    { hide_id: 'H1', batch_no: 'B1', qty: 3872 },
  ];

  const normalized = normalizeBatchInfoForQty(batchInfo, 3872);
  const totalQty = normalized.reduce((sum, batch) => sum + Number(batch.qty || 0), 0);

  assert.equal(totalQty, 3872);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].qty, 3872);
});

test('resolveUpdatedItemQty clamps inflated hide totals back to the current item quantity', () => {
  const resolvedQty = resolveUpdatedItemQty({ incomingQty: 15488, currentQty: 3872 });

  assert.equal(resolvedQty, 3872);
});
