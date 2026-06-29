const normalizeTransportAmount = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveRevisionStatus = ({ requiresReapproval, originalStatus }) => {
  if (requiresReapproval) return 'PENDING_APPROVAL';
  if (originalStatus === 'CONFIRMED') return 'CONFIRMED';
  return 'ACTIVE';
};

const normalizeRevisionRate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeRevisionItems = ({ originalItems = [], requestedItems = [] } = {}) => {
  const originalItemsList = Array.isArray(originalItems) ? originalItems : [];
  const requestedItemsList = Array.isArray(requestedItems) ? requestedItems : [];
  const originalRateByProduct = new Map();

  originalItemsList.forEach((item) => {
    const productId = Number(item?.product_id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    if (!originalRateByProduct.has(productId)) {
      originalRateByProduct.set(productId, normalizeRevisionRate(item?.rate));
    }
  });

  if (requestedItemsList.length === 0) {
    return originalItemsList
      .map((item) => {
        const productId = Number(item?.product_id);
        const qty = Number(item?.qty || 0);
        if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(qty) || qty <= 0) {
          return null;
        }

        return {
          product_id: productId,
          qty,
          rate: normalizeRevisionRate(item?.rate) ?? originalRateByProduct.get(productId) ?? null,
          batch_info: item?.batch_info ?? null,
          surcharge: Number(item?.surcharge || 0),
        };
      })
      .filter(Boolean);
  }

  return requestedItemsList
    .map((item) => {
      const productId = Number(item?.product_id);
      const qty = Number(item?.qty || 0);
      if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(qty) || qty <= 0) {
        return null;
      }

      const originalItem = originalItemsList.find((existingItem) => Number(existingItem?.product_id) === productId);
      return {
        product_id: productId,
        qty,
        rate: normalizeRevisionRate(item?.rate) ?? originalRateByProduct.get(productId) ?? normalizeRevisionRate(originalItem?.rate) ?? null,
        batch_info: item?.batch_info ?? originalItem?.batch_info ?? null,
        surcharge: Number(item?.surcharge || originalItem?.surcharge || 0),
      };
    })
    .filter(Boolean);
};

const buildRevisionPiData = ({
  originalPi,
  transportAmount,
  revisionReason,
  requiresReapproval,
  revisionNo,
  createdBy,
}) => {
  const parentPiId = originalPi?.parent_pi_id || originalPi?.id || null;
  const nextStatus = resolveRevisionStatus({
    requiresReapproval,
    originalStatus: originalPi?.status,
  });

  return {
    customer_id: originalPi?.customer_id,
    created_by: createdBy ?? originalPi?.created_by,
    company_name: originalPi?.company_name,
    location: originalPi?.location,
    status: nextStatus,
    invoice_bill_number: originalPi?.invoice_bill_number,
    confirmed_at: nextStatus === 'ACTIVE' || nextStatus === 'CONFIRMED' ? new Date() : null,
    dispatched_at: null,
    cancelled_at: null,
    expires_at: originalPi?.expires_at,
    transport_type_id: originalPi?.transport_type_id,
    transport_id: originalPi?.transport_id,
    delivery_address: originalPi?.delivery_address,
    weight_kg: originalPi?.weight_kg,
    transport_payment_status: originalPi?.transport_payment_status,
    payment_status: originalPi?.payment_status,
    amount_paid: originalPi?.amount_paid || 0,
    receiver_courier_name: originalPi?.receiver_courier_name,
    transport_amount: normalizeTransportAmount(transportAmount),
    perforation_qty: originalPi?.perforation_qty || 0,
    perforation_amount: originalPi?.perforation_amount || 0,
    perforation_payment_status: originalPi?.perforation_payment_status,
    billing_address: originalPi?.billing_address,
    shipping_address: originalPi?.shipping_address,
    return_reason: null,
    returned_at: null,
    hide_reassignment_required: Boolean(originalPi?.hide_reassignment_required),
    parent_pi_id: parentPiId,
    revision_no: revisionNo || 1,
    revision_reason: revisionReason || null,
    is_revision: true,
  };
};

module.exports = {
  normalizeTransportAmount,
  resolveRevisionStatus,
  normalizeRevisionItems,
  buildRevisionPiData,
};
