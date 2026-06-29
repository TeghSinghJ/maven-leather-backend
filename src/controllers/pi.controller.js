const {
  LeatherStock,
  ProformaInvoice,
  PIItem,
  CollectionPrice,
  LeatherHideStock,
  HideReassignmentLog,
  Customer,
  TransportType,
  Transport,
  LeatherProduct,
  CollectionSeries,
  SubCollection,
  MainCollection,
  Batch,
  User,
  sequelize,
} = require("../../models");
const { Op, Transaction } = require("sequelize");
const { COMPANY, COMPANY_LIST } = require("../constants/company.constants");
const generateExactPIPdf = require('../utils/piPdf');
const { recalculateLeatherStock } = require("../services/leatherStock.service");
const { createOrderFormSnapshotFromPI } = require('./orderForm.controller');
const { buildRevisionPiData } = require('../utils/piRevision');

const safeSetHideReassignmentRequired = async (pi, transaction) => {
  if (!pi) return;

  try {
    await pi.update(
      { hide_reassignment_required: true },
      { transaction },
    );
  } catch (err) {
    const message = err?.original?.sqlMessage || err?.message || "";
    if (message.includes("Unknown column 'hide_reassignment_required'") || message.includes('Unknown column') || message.includes('hide_reassignment_required')) {
      console.warn(
        'Skipping hide_reassignment_required update because the database column does not exist.',
      );
      return;
    }
    throw err;
  }
};

const parseBatchInfo = (batchInfo) => {
  if (Array.isArray(batchInfo)) return batchInfo;
  if (typeof batchInfo === "string") {
    try {
      return JSON.parse(batchInfo);
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeBatchInfoForQty = (batchInfo, itemQty) => {
  const parsedBatches = parseBatchInfo(batchInfo)
    .filter((batch) => batch && batch.hide_id && Number(batch.qty || 0) > 0)
    .map((batch) => ({
      ...batch,
      hide_id: String(batch.hide_id),
      batch_no: batch.batch_no ? String(batch.batch_no) : "",
      qty: Number(batch.qty || 0),
    }));

  if (parsedBatches.length === 0) return [];

  const mergedBatches = new Map();
  for (const batch of parsedBatches) {
    const key = `${batch.hide_id || ""}:${batch.batch_no || ""}`;
    const existing = mergedBatches.get(key);
    if (existing) {
      existing.qty = Number(existing.qty || 0) + Number(batch.qty || 0);
    } else {
      mergedBatches.set(key, { ...batch });
    }
  }

  const normalized = Array.from(mergedBatches.values())
    .filter((batch) => Number(batch.qty || 0) > 0)
    .sort((a, b) => Number(b.qty || 0) - Number(a.qty || 0));

  const targetQty = Number(itemQty || 0);
  if (!Number.isFinite(targetQty) || targetQty <= 0) {
    return normalized.map((batch) => ({ ...batch, qty: Number(batch.qty || 0) }));
  }

  let totalQty = normalized.reduce((sum, batch) => sum + Number(batch.qty || 0), 0);
  if (totalQty <= targetQty) {
    return normalized.map((batch) => ({ ...batch, qty: Number(batch.qty || 0) }));
  }

  const trimmed = normalized.map((batch) => ({ ...batch, qty: Number(batch.qty || 0) }));
  let remainingQty = totalQty - targetQty;
  for (const batch of trimmed) {
    if (remainingQty <= 0) break;
    const availableToTrim = Math.min(Number(batch.qty || 0), remainingQty);
    batch.qty = Number((Number(batch.qty || 0) - availableToTrim).toFixed(2));
    remainingQty = Number((remainingQty - availableToTrim).toFixed(2));
  }

  return trimmed.filter((batch) => Number(batch.qty || 0) > 0);
};

const resolveUpdatedItemQty = ({ incomingQty, currentQty }) => {
  const currentQtyValue = Number(currentQty || 0);
  if (incomingQty === undefined || incomingQty === null || incomingQty === "") {
    return currentQtyValue;
  }

  const parsedQty = Number(incomingQty);
  if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
    return currentQtyValue;
  }

  return Math.min(parsedQty, currentQtyValue || parsedQty);
};

exports.normalizeBatchInfoForQty = normalizeBatchInfoForQty;
exports.resolveUpdatedItemQty = resolveUpdatedItemQty;

const SALES_LOCATION_PRIORITY = [
  { label: "Bangalore", tokens: ["bangalore", "bengaluru"] },
  { label: "Hyderabad", tokens: ["hyderabad"] },
  { label: "Mumbai", tokens: ["mumbai"] },
  { label: "Delhi", tokens: ["delhi", "new delhi", "ncr"] },
  { label: "Gujarat", tokens: ["gujarat", "ahmedabad", "surat", "vadodara", "rajkot"] },
  { label: "Karnataka", tokens: ["karnataka"] },
  { label: "Maharashtra", tokens: ["maharashtra"] },
  { label: "Telangana", tokens: ["telangana"] },
  { label: "Tamil Nadu", tokens: ["tamil nadu", "chennai"] },
  { label: "Kerala", tokens: ["kerala", "kochi", "cochin"] },
  { label: "Rajasthan", tokens: ["rajasthan", "jaipur"] },
  { label: "Punjab", tokens: ["punjab", "ludhiana"] },
  { label: "Andhra Pradesh", tokens: ["andhra pradesh", "vizag", "visakhapatnam"] },
];

const normalizeText = (value) => String(value || "").toLowerCase();

const quantitiesMatch = (a, b, tolerance = 0.01) =>
  Math.abs(Number(a) - Number(b)) <= tolerance;

const normalizeRevisionRate = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildRevisitAllocationPlan = ({
  existingItem,
  requestedQty,
  availableHideStocks,
}) => {
  const existingBatches = normalizeBatchInfoForQty(
    existingItem?.batch_info,
    existingItem?.qty,
  );

  const targetQty = Math.max(0, Number(requestedQty || 0));
  const preservedBatchInfo = [];
  const preservedHideKeys = new Set();
  let preservedQty = 0;

  const availableStocks = (Array.isArray(availableHideStocks) ? availableHideStocks : [])
    .map((stock) => ({
      hide_id: stock.hide_id,
      batch_no: stock.batch_no,
      qty: Number(stock.qty || 0),
    }))
    .filter((stock) => stock.qty > 0)
    .sort((a, b) => b.qty - a.qty);

  const availableStockMap = new Map();
  for (const stock of availableStocks) {
    const key = `${stock.hide_id || ""}:${stock.batch_no || ""}`;
    availableStockMap.set(key, (availableStockMap.get(key) || 0) + stock.qty);
  }

  for (const batch of existingBatches) {
    if (preservedQty >= targetQty) break;
    const key = `${batch.hide_id || ""}:${batch.batch_no || ""}`;
    const availableQty = availableStockMap.get(key) || 0;
    if (availableQty <= 0) continue;

    const qtyToPreserve = Math.min(Number(batch.qty || 0), targetQty - preservedQty, availableQty);
    if (qtyToPreserve <= 0) continue;

    preservedBatchInfo.push({
      ...batch,
      qty: qtyToPreserve,
    });
    preservedHideKeys.add(key);
    preservedQty += qtyToPreserve;
  }

  const additionalBatchInfo = [];
  let remainingQty = Math.max(0, targetQty - preservedQty);

  for (const stock of availableStocks) {
    if (remainingQty <= 0) break;
    const key = `${stock.hide_id || ""}:${stock.batch_no || ""}`;
    if (preservedHideKeys.has(key)) continue;

    const qtyToUse = Math.min(stock.qty, remainingQty);
    if (qtyToUse > 0) {
      additionalBatchInfo.push({
        hide_id: stock.hide_id,
        batch_no: stock.batch_no,
        qty: qtyToUse,
      });
      remainingQty -= qtyToUse;
    }
  }

  return {
    preservedBatchInfo,
    additionalBatchInfo,
    additionalQty: targetQty - preservedQty - remainingQty,
    allocatedQty: preservedQty + (targetQty - preservedQty - remainingQty),
  };
};

const restoreRevisitItemAllocations = async ({
  item,
  transaction,
  restoredProducts,
  restoredHideKeys,
}) => {
  if (!item) return;

  const productId = item.product_id;
  if (!restoredProducts.has(productId)) {
    const stock = await LeatherStock.findOne({
      where: { product_id: productId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (stock) {
      const qtyToRestore = Math.min(
        Number(item.qty || 0),
        Math.max(0, Number(stock.reserved_qty || 0)),
      );
      if (qtyToRestore > 0) {
        stock.available_qty += qtyToRestore;
        stock.reserved_qty = Math.max(0, Number(stock.reserved_qty || 0) - qtyToRestore);
        await stock.save({ transaction });
      }
    }
    restoredProducts.add(productId);
  }

  const normalizedBatches = normalizeBatchInfoForQty(
    item?.batch_info,
    item?.qty,
  ).filter((batch) => batch && batch.hide_id);

  for (const batch of normalizedBatches) {
    const hideKey = `${batch.hide_id || ""}:${batch.batch_no || ""}`;
    if (restoredHideKeys.has(hideKey)) continue;

    const hideStock = await LeatherHideStock.findOne({
      where: { hide_id: batch.hide_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (hideStock) {
      const qtyToRestore = Number(batch.qty || 0);
      const shouldRestoreQty =
        hideStock.status === "RESERVED" ||
        hideStock.status === "BLOCKED" ||
        Number(hideStock.qty || 0) < qtyToRestore;

      if (shouldRestoreQty) {
        hideStock.qty = Number(hideStock.qty || 0) + qtyToRestore;
      }
      hideStock.status = "AVAILABLE";
      await hideStock.save({ transaction });
    }
    restoredHideKeys.add(hideKey);
  }
};

const inferLocationLabel = (pi) => {
  const searchText = normalizeText(
    [
      pi.customer?.state,
      pi.customer?.address,
      pi.shipping_address,
      pi.billing_address,
      pi.delivery_address,
    ]
      .filter(Boolean)
      .join(" "),
  );

  for (const entry of SALES_LOCATION_PRIORITY) {
    if (entry.tokens.some((token) => searchText.includes(token))) {
      return entry.label;
    }
  }

  return pi.customer?.state || "Unknown";
};

const matchesLocationFilter = (pi, location) => {
  if (!location) return true;
  const locationText = normalizeText(location);
  const searchText = normalizeText(
    [
      pi.customer?.state,
      pi.customer?.address,
      pi.shipping_address,
      pi.billing_address,
      pi.delivery_address,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return searchText.includes(locationText) || normalizeText(inferLocationLabel(pi)) === locationText;
};

const toDayKey = (dateValue) => {
  if (!dateValue) return "Unknown";
  return new Date(dateValue).toISOString().slice(0, 10);
};

const collectReservedHideIdsInPendingOrders = async (
  productId,
  excludePiId = null,
) => {
  const where = { product_id: Number(productId) };
  if (excludePiId) {
    where.pi_id = { [Op.ne]: Number(excludePiId) };
  }

  const pendingItems = await PIItem.findAll({
    where,
    include: [
      {
        model: ProformaInvoice,
        as: "pi",
        where: { status: "PENDING_APPROVAL" },
        attributes: ["id"],
      },
    ],
  });

  const hideIds = new Set();
  for (const item of pendingItems) {
    const batchInfo = parseBatchInfo(item.batch_info);
    for (const batch of batchInfo) {
      if (batch.hide_id) hideIds.add(batch.hide_id);
    }
  }

  return Array.from(hideIds);
};

const reassignReservedHidesFromOtherOrders = async (
  targetPiId,
  productId,
  hideIds,
  userId,
  transaction,
) => {
  const result = [];
  if (!Array.isArray(hideIds) || hideIds.length === 0) return result;

  const pendingItems = await PIItem.findAll({
    where: {
      product_id: Number(productId),
      pi_id: { [Op.ne]: Number(targetPiId) },
    },
    include: [
      {
        model: ProformaInvoice,
        as: "pi",
        where: { status: "PENDING_APPROVAL" },
        attributes: ["id"],
      },
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  for (const hideId of hideIds) {
    const itemsToReassign = pendingItems.filter((item) => {
      const oldBatchInfo = parseBatchInfo(item.batch_info);
      return oldBatchInfo.some((b) => b.hide_id === hideId);
    });

    for (const item of itemsToReassign) {
      const oldBatchInfo = parseBatchInfo(item.batch_info);
      const updatedBatchInfo = oldBatchInfo.filter(
        (batch) => batch.hide_id !== hideId,
      );
      const updatedQty = updatedBatchInfo.reduce(
        (sum, batch) => sum + Number(batch.qty || 0),
        0,
      );

      await item.update(
        {
          batch_info: updatedBatchInfo,
          qty: updatedQty,
        },
        { transaction },
      );

      const previousPi = item.pi;
      if (previousPi) {
        await safeSetHideReassignmentRequired(previousPi, transaction);
      }

      await HideReassignmentLog.create(
        {
          from_pi_id: previousPi?.id || null,
          to_pi_id: targetPiId,
          user_id: userId || null,
          hide_id: hideId,
          action: "REASSIGNED",
          note: `Hide ${hideId} reassigned from PI ${previousPi?.id} to PI ${targetPiId}`,
        },
        { transaction },
      );

      result.push({
        hide_id: hideId,
        from_pi_id: previousPi?.id || null,
        from_item_id: item.id,
      });
    }
  }

  return result;
};

const unlockReservedHide = async (
  hideStockId,
  targetPiId,
  userId,
  transaction,
) => {
  const hideStock = await LeatherHideStock.findByPk(hideStockId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!hideStock) {
    throw new Error("Hide stock not found");
  }

  if (hideStock.status !== "RESERVED") {
    throw new Error("Only RESERVED hides can be unlocked");
  }

  const pendingItems = await PIItem.findAll({
    where: {
      product_id: hideStock.product_id,
      pi_id: { [Op.ne]: Number(targetPiId) },
    },
    include: [
      {
        model: ProformaInvoice,
        as: "pi",
        where: { status: "PENDING_APPROVAL" },
        attributes: ["id"],
      },
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const fromPiIds = new Set();

  for (const item of pendingItems) {
    const oldBatchInfo = parseBatchInfo(item.batch_info);
    if (!oldBatchInfo.some((batch) => batch.hide_id === hideStock.hide_id))
      continue;

    const updatedBatchInfo = oldBatchInfo.filter(
      (batch) => batch.hide_id !== hideStock.hide_id,
    );
    const updatedQty = updatedBatchInfo.reduce(
      (sum, batch) => sum + Number(batch.qty || 0),
      0,
    );

    await item.update(
      {
        batch_info: updatedBatchInfo,
        qty: updatedQty,
      },
      { transaction },
    );

    const previousPi = item.pi;
    if (previousPi) {
      await safeSetHideReassignmentRequired(previousPi, transaction);
      fromPiIds.add(previousPi.id);
    }
  }

  hideStock.status = "AVAILABLE";
  await hideStock.save({ transaction });

  for (const fromPiId of Array.from(fromPiIds)) {
    await HideReassignmentLog.create(
      {
        from_pi_id: fromPiId,
        to_pi_id: Number(targetPiId),
        user_id: userId || null,
        hide_id: hideStock.hide_id,
        action: "UNLOCKED",
        note: `Hide ${hideStock.hide_id} unlocked from PI ${fromPiId} for PI ${targetPiId}`,
      },
      { transaction },
    );
  }

  return hideStock;
};

const blockHideStockBatchItems = async (pi, transaction) => {
  if (!pi.items || !Array.isArray(pi.items)) return;

  for (const item of pi.items) {
    const batches = parseBatchInfo(item.batch_info);
    for (const b of batches) {
      if (!b.hide_id || b.hide_id === "roll") continue;

      const hideStock = await LeatherHideStock.findOne({
        where: { hide_id: b.hide_id, batch_no: b.batch_no },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!hideStock) {
        console.warn(
          `HideStock not found while blocking PI (hide_id=${b.hide_id}, batch_no=${b.batch_no}), skipping`,
        );
        continue;
      }

      hideStock.status = "BLOCKED";
      console.log(`Blocking HideStock (hide_id=${b.hide_id}, batch_no=${b.batch_no}) status: ${hideStock.status}`);
      await hideStock.save({ transaction });
    }
  }
};

/**
 * Utility: Find optimal hide combinations for a requested quantity
 * Returns combinations sorted by closeness to requested quantity
 */
const findOptimalHidesCombinations = (
  hideList,
  requested_qty,
  tolerance = 1,
) => {
  if (!Array.isArray(hideList) || hideList.length === 0) return [];

  const EPSILON = 0.01;
  const roundQty = (value) => Number((Number(value) || 0).toFixed(2));
  const normalizedRequestedQty = roundQty(requested_qty);

  // Normalize hides: ensure numeric qty and stable order (largest first helps greedy fallback)
  const normalized = hideList
    .map((h) => ({ hide_id: h.hide_id, qty: roundQty(h.qty) }))
    .filter((h) => h.qty > 0)
    .sort((a, b) => b.qty - a.qty);

  if (normalized.length === 0) return [];

  const buildCombination = (selectedHides, total) => {
    const roundedTotal = roundQty(total);
    const difference = roundQty(roundedTotal - normalizedRequestedQty);
    const absDistance = Math.abs(difference);

    return {
      allocated_qty: roundedTotal,
      difference,
      distance: absDistance,
      hides: selectedHides.map((h) => ({
        hide_id: h.hide_id,
        hide_qty: roundQty(h.qty),
      })),
      withinTolerance: absDistance <= tolerance + EPSILON,
    };
  };

  const combinations = [];
  const n = normalized.length;

  // Use a scaled subset-sum style search so large batches still find exact or near-exact matches.
  // This is much more reliable than the previous greedy fallback for big hide sets.
  const scale = 100;
  const targetCents = Math.round(normalizedRequestedQty * scale);
  const maxCents = Math.round(
    Math.max(normalizedRequestedQty, normalizedRequestedQty + tolerance) * scale + 100,
  );
  const dp = new Map([[0, []]]);

  for (const hide of normalized) {
    const hideCents = Math.round(hide.qty * scale);
    const entries = Array.from(dp.entries());
    for (const [sumCents, selectedHides] of entries) {
      const nextSumCents = sumCents + hideCents;
      if (nextSumCents <= maxCents && !dp.has(nextSumCents)) {
        dp.set(nextSumCents, [...selectedHides, hide]);
      }
    }
  }

  for (const [sumCents, selectedHides] of dp.entries()) {
    if (selectedHides.length === 0) continue;
    combinations.push(buildCombination(selectedHides, sumCents / scale));
  }

  // Prefer exact matches first, otherwise closest match and then larger allocated qty for less shortfall
  combinations.sort((a, b) => {
    if (Math.abs(a.difference) <= EPSILON && Math.abs(b.difference) > EPSILON) return -1;
    if (Math.abs(b.difference) <= EPSILON && Math.abs(a.difference) > EPSILON) return 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return b.allocated_qty - a.allocated_qty;
  });

  const exactMatch = combinations.find((c) => Math.abs(c.difference) <= EPSILON);
  if (exactMatch) {
    return [exactMatch];
  }

  // Return top 5: prioritize within tolerance, then closest matches
  const withinTolerance = combinations.filter((c) => c.withinTolerance);
  const outsideTolerance = combinations.filter((c) => !c.withinTolerance);

  return [
    ...withinTolerance.slice(0, 5),
    ...outsideTolerance.slice(0, Math.max(0, 5 - withinTolerance.length)),
  ];
};
exports.createPI = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const {
      customer_id,
      items,
      price_type,
      delivery_address,
      billing_address,
      shipping_address,
      location,
      transport_type_id,
      transport_id,
      weight_kg,
      transport_payment_status,
      perforation_qty,
      perforation_amount,
      perforation_payment_status,
    } = req.body;

    console.log("CREATE PI REQUEST:", {
      customer_id,
      delivery_address,
      billing_address,
      shipping_address,
      location,
      hasItems: Array.isArray(items)
    });

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No items provided for PI");
    }

    let transportAmount = 0;
    if (transport_type_id && weight_kg) {
      const transportType = await TransportType.findByPk(transport_type_id, {
        transaction: t,
      });
      if (!transportType) throw new Error("Invalid transport type");
      transportAmount = weight_kg * Number(transportType.base_price);
    }

    const perforationQtyValue = Number(perforation_qty || 0);
    const perforationAmountValue = Number(
      perforation_amount || (perforationQtyValue > 0 ? perforationQtyValue * 50 : 0),
    );

    // 🔐 RBAC: Set PI creator and location
    const pi = await ProformaInvoice.create(
      {
        customer_id,
        created_by: req.user.id,
        delivery_address,
        billing_address,
        shipping_address,
        location,
        transport_type_id,
        transport_id,
        weight_kg,
        transport_payment_status,
        transport_amount: transportAmount,
        perforation_qty: perforationQtyValue,
        perforation_amount: perforationAmountValue,
        perforation_payment_status,
        status: "ACTIVE",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      { transaction: t },
    );

    for (const item of items) {
      const { product_id, qty, batch_no, hides } = item;

      if (!product_id || !qty || !Array.isArray(hides) || hides.length === 0) {
        throw new Error(
          "Invalid item payload: product_id, qty, and hides are required",
        );
      }

      let allocatedQty = 0;
      const batchInfo = [];

      for (const h of hides) {
        const { hide_id, hide_qty } = h;

        const hideStock = await LeatherHideStock.findOne({
          where: { hide_id, status: "AVAILABLE", batch_no },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!hideStock)
          throw new Error(`Hide ${hide_id} in batch ${batch_no} not available`);
        if (hideStock.qty < hide_qty)
          throw new Error(
            `Hide ${hide_id} in batch ${batch_no} has insufficient quantity`,
          );

        hideStock.qty -= hide_qty;
        hideStock.status = hideStock.qty === 0 ? "RESERVED" : "AVAILABLE";
        await hideStock.save({ transaction: t });

        batchInfo.push({
          hide_id,
          batch_no,
          qty: hide_qty,
          collection_series_id: hideStock.collection_series_id,
        });
        allocatedQty += hide_qty;
      }

      if (allocatedQty !== qty)
        throw new Error(
          `Allocated quantity (${allocatedQty}) does not match requested quantity (${qty}) for product ${product_id}`,
        );

      const leatherStock = await LeatherStock.findOne({
        where: { product_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!leatherStock || leatherStock.available_qty < qty)
        throw new Error(`Insufficient overall stock for product ${product_id}`);

      leatherStock.available_qty -= qty;
      leatherStock.reserved_qty += qty;
      await leatherStock.save({ transaction: t });

      const priceObj = await CollectionPrice.findOne({
        where: {
          collection_series_id: batchInfo[0].collection_series_id,
          price_type,
        },
        transaction: t,
      });
      if (!priceObj) throw new Error("Price not defined for product");

      await PIItem.create(
        {
          pi_id: pi.id,
          product_id,
          qty,
          rate: priceObj.price,
          batch_info: batchInfo,
        },
        { transaction: t },
      );
    }

    const createdPi = await ProformaInvoice.findByPk(pi.id, {
      transaction: t,
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: PIItem, as: 'items', include: [{ model: LeatherProduct, as: 'product' }] },
      ],
    });

    await createOrderFormSnapshotFromPI(createdPi, req.user, t);

    await t.commit();
    res.status(201).json({ message: "PI created successfully", pi_id: pi.id });
  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

exports.getPIs = async (req, res) => {
  try {
    // 🔐 RBAC: Build where clause based on user role
    const where = {};

    // Only ADMIN sees all PIs - everyone else sees only their own
    if (req.user.role !== "ADMIN") {
      where.created_by = req.user.id;
    }

    // Date filter + status filter + company filter
    const { dateFilter, status, company_name } = req.query;
    console.log("Date filter received:", dateFilter, "status filter:", status, "company_name filter:", company_name);
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (company_name && company_name !== "ALL") {
      where.company_name = company_name;
    }
    if (dateFilter && dateFilter !== "all") {
      const now = new Date();
      if (dateFilter === "today") {
        const start = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        where.createdAt = { [Op.gte]: start };
        console.log("Filtering for today:", start);
      } else if (dateFilter === "week") {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        where.createdAt = { [Op.gte]: start };
        console.log("Filtering for week:", start);
      } else if (dateFilter === "month") {
        const start = new Date(now);
        start.setDate(now.getDate() - 30);
        where.createdAt = { [Op.gte]: start };
        console.log("Filtering for month:", start);
      }
    }

    const pis = await ProformaInvoice.findAll({
      where,
      attributes: [
        "id",
        "customer_id",
        "company_name",
        "created_by",
        "status",
        "hide_reassignment_required",
        "invoice_bill_number",
        "confirmed_at",
        "dispatched_at",
        "cancelled_at",
        "return_reason",
        "returned_at",
        "expires_at",
        "createdAt",
        "updatedAt",
        "transport_amount",
        "transport_payment_status",
      ],
      include: [
        {
          model: PIItem,
          as: "items",
          include: [
            {
              model: LeatherProduct,
              as: "product",
              attributes: [
                "id",
                "leather_code",
                "color",
                "hsn_code",
                "image_url",
              ],
            },
          ],
        },
        {
          model: Customer,
          as: "customer",
          attributes: [
            "customer_name",
            "whatsapp_number",
            "contact_number",
            "address",
            "state",
            "gst_number",
            "pin_code",
            "status",
          ],
        },
        {
          model: require("../../models").User,
          as: "creator",
          attributes: ["id", "name", "email", "location"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    console.log("Fetched PI : ",pis)
    const formattedResponse = pis.map((pi) => {
      const piJson = pi.toJSON();
      const normalizedItems = (piJson.items || []).map((item) => ({
        ...item,
        batch_info: normalizeBatchInfoForQty(item.batch_info, item.qty),
      }));
      return {
        ...piJson,
        ...(piJson.customer || {}),
        status: piJson.status,
        customer: undefined,
        items: normalizedItems,
      };
    });

    res.json(formattedResponse);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPIById = async (req, res) => {
  try {
    const { id } = req.params;

    const pi = await ProformaInvoice.findOne({
      where: { id },
      include: [
        {
          model: PIItem,
          as: "items",
          include: [
            {
              model: LeatherProduct,
              as: "product",
              attributes: [
                "id",
                "leather_code",
                "color",
                "hsn_code",
                "image_url",
              ],
            },
          ],
        },
        {
          model: Customer,
          as: "customer",
          attributes: [
            "id",
            "customer_name",
            "whatsapp_number",
            "contact_number",
            "address",
            "state",
            "gst_number",
            "pin_code",
            "status",
          ],
        },
        {
          model: TransportType,
          as: "transportType",
          attributes: ["id", "name"],
        },
        {
          model: Transport,
          as: "transport",
          attributes: ["id", "name"],
          required: false,
        },
      ],
    });

    if (!pi)
      return res.status(404).json({ error: "Proforma Invoice not found" });

    // RBAC check
    if (
      req.user.role === "BUSINESS_EXECUTIVE" &&
      pi.created_by !== req.user.id
    ) {
      return res
        .status(403)
        .json({ error: "Unauthorized: You can only view your own PIs" });
    }

    const items = pi.items.map((item) => {
      // Ensure batch_info is always an array and normalize it to the item quantity
      let batchInfo = [];
      if (Array.isArray(item.batch_info)) batchInfo = item.batch_info;
      else if (typeof item.batch_info === "string") {
        try {
          batchInfo = JSON.parse(item.batch_info);
        } catch {
          batchInfo = [];
        }
      }

      const normalizedBatchInfo = normalizeBatchInfoForQty(
        batchInfo,
        item.qty,
      );

      // Create batch summary
      const batch_summary = normalizedBatchInfo.reduce((acc, b) => {
        if (!acc[b.batch_no])
          acc[b.batch_no] = { batch_no: b.batch_no, qty: 0 };
        acc[b.batch_no].qty += b.qty;
        return acc;
      }, {});

      return {
        ...item.toJSON(),
        batch_info: normalizedBatchInfo,
        batch_summary: Object.values(batch_summary),
      };
    });

    res.json({ ...pi.toJSON(), items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.cancelPI = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });
  try {
    const pi = await ProformaInvoice.findByPk(req.params.id, {
      include: [
        {
          model: PIItem,
          as: "items",
          attributes: ["id", "product_id", "qty", "batch_info"],
        },
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!pi) throw new Error("PI not found");
    if (req.user.role === "BUSINESS_EXECUTIVE" && pi.created_by !== req.user.id)
      throw new Error("Unauthorized: You can only cancel your own PIs");
    if (!["ACTIVE", "PENDING_APPROVAL", "CONFIRMED"].includes(pi.status))
      throw new Error(
        `PI can only be cancelled if it is PENDING_APPROVAL, ACTIVE, or CONFIRMED. Current status: ${pi.status}`,
      );

    const productIds = new Set(pi.items.map((i) => i.product_id));

    const stocks = await LeatherStock.findAll({
      where: { product_id: { [Op.in]: Array.from(productIds) } },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const stockMap = {};
    stocks.forEach((s) => {
      if (!stockMap[s.product_id]) stockMap[s.product_id] = [];
      stockMap[s.product_id].push(s);
    });

    const hideProductIds = new Set();
    for (const item of pi.items) {
      const qtyToRestore = Number(item.qty) || 0;
      const leatherStockRows = stockMap[item.product_id] || [];
      for (const stock of leatherStockRows) {
        stock.available_qty += qtyToRestore;
        stock.reserved_qty -= qtyToRestore;
        if (stock.reserved_qty < 0) stock.reserved_qty = 0;
        await stock.save({ transaction: t });
      }

      let batches = [];
      if (Array.isArray(item.batch_info)) batches = item.batch_info;
      else if (typeof item.batch_info === "string") {
        try {
          batches = JSON.parse(item.batch_info);
        } catch {
          batches = [];
        }
      }

      for (const b of batches) {
        if (!b.hide_id) continue;
        let hideStock = await LeatherHideStock.findOne({
          where: {
            hide_id: b.hide_id,
            batch_no: b.batch_no,
            product_id: item.product_id,
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!hideStock && b.hide_id) {
          hideStock = await LeatherHideStock.findOne({
            where: {
              hide_id: b.hide_id,
              product_id: item.product_id,
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (hideStock) {
            console.warn(
              `HideStock found by hide_id fallback while cancelling PI (hide_id=${b.hide_id}, batch_no=${b.batch_no}, product_id=${item.product_id})`,
            );
          }
        }

        if (!hideStock) {
          console.warn(
            `HideStock not found while cancelling PI (hide_id=${b.hide_id}, batch_no=${b.batch_no}, product_id=${item.product_id}), skipping hide stock restoration`,
          );
          continue;
        }
        const batchQty = Number(b.qty) || 0;
        hideStock.qty += batchQty;
        hideStock.status = "AVAILABLE";
        await hideStock.save({ transaction: t });
        if (hideStock.product_id) hideProductIds.add(hideStock.product_id);
      }
    }

    pi.status = "CANCELLED";
    console.log(`PI status changing to ${pi.status}`);
    pi.cancelled_at = new Date();
    await pi.save({ transaction: t });
    await t.commit();

    // Recalculate hide-based leather stock after the cancel transaction commits.
    // Running this inside the transaction can trigger lock/deadlock issues on the
    // same stock rows and cause the cancel request to fail.
    for (const productId of hideProductIds) {
      try {
        await recalculateLeatherStock(productId);
      } catch (recalcErr) {
        console.error(`Failed to recalculate leather stock after cancel for product ${productId}:`, recalcErr);
      }
    }

    res.json({ message: "PI cancelled and stock fully restored" });
  } catch (err) {
    try {
      if (t && !t.finished) {
        await t.rollback();
      }
    } catch (rollbackErr) {
      console.error("Cancel PI rollback failed:", rollbackErr);
    }
    res.status(400).json({ error: err.message });
  }
};

exports.downloadPI = async (req, res) => {
  try {
    const pi = await ProformaInvoice.findByPk(req.params.id, {
      attributes: [
        "id",
        "customer_id",
        "company_name",
        "status",
        "createdAt",
        "transport_amount",
        "transport_payment_status",
        "perforation_qty",
        "perforation_amount",
        "perforation_payment_status",
        "delivery_address",
        "billing_address",
        "shipping_address",
        "weight_kg",
      ],
      include: [
        {
          model: PIItem,
          as: "items",
          attributes: ["id", "product_id", "qty", "rate", "batch_info"],
          include: [
            {
              model: LeatherProduct,
              as: "product",
              attributes: ["id", "leather_code", "color", "hsn_code"],
              include: [
                {
                  model: CollectionSeries,
                  as: "series",
                  include: [
                    {
                      model: SubCollection,
                      as: "subCollection",
                      include: [
                        {
                          model: MainCollection,
                          as: "mainCollection",
                          attributes: ["name"],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: Customer,
          as: "customer",
          attributes: [
            "id",
            "customer_name",
            "address",
            "gst_number",
            "state",
            "pin_code",
            "contact_number",
          ],
        },
      ],
    });

    if (!pi) {
      return res.status(404).json({ error: "PI not found" });
    }

    const piData = pi.toJSON();
    console.log("DOWNLOAD PI DATA:", {
      id: piData.id,
      perforation_qty: piData.perforation_qty,
      perforation_amount: piData.perforation_amount,
    });
    if (piData.customer) {
      piData.customer_name = piData.customer.customer_name || "";
      piData.company_name = piData.company_name || COMPANY.MARVIN;
      piData.address = piData.customer.address || "";
      piData.gst_number = piData.customer.gst_number || "-";
      piData.state = piData.customer.state || "";
      piData.pin_code = piData.customer.pin_code || "";
      piData.contact = piData.customer.contact_number || "-";
    } else {
      piData.customer_name = piData.customer_name || "";
      piData.company_name = piData.company_name || COMPANY.MARVIN;
      piData.address = piData.address || "";
      piData.gst_number = piData.gst_number || "-";
      piData.state = piData.state || "";
      piData.pin_code = piData.pin_code || "";
      piData.contact = piData.contact || "-";
    }
    
    // Ensure address fields are set for PDF
    piData.billing_address = piData.billing_address || piData.address || "";
    piData.shipping_address = piData.shipping_address || piData.delivery_address || piData.address || "";
    piData.delivery_address = piData.delivery_address || piData.address || "";
    piData.perforation_amount = Number(
      piData.perforation_amount || (Number(piData.perforation_qty || 0) > 0 ? 50 : 0),
    );
    
    return generateExactPIPdf(res, piData);
  } catch (err) {
    console.error("Download PI Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Suggest revised hide allocations without committing changes
 * Returns allocation details (allocated_qty, difference, hides) per item for user preview
 */
exports.suggestRevisit = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No items provided");
    }

    const pi = await ProformaInvoice.findByPk(id, {
      include: [{ model: PIItem, as: "items" }],
      transaction: t,
      lock: t.LOCK.SHARE,
    });

    if (!pi) throw new Error("PI not found");
    if (!["ACTIVE", "PENDING_APPROVAL", "CONFIRMED"].includes(pi.status)) {
      throw new Error(
        "PI can only be revisited if status is ACTIVE, PENDING_APPROVAL, or CONFIRMED",
      );
    }

    // 🔐 RBAC: Business Executive can only request suggestions for their own PIs
    if (
      req.user.role === "BUSINESS_EXECUTIVE" &&
      pi.created_by !== req.user.id
    ) {
      throw new Error(
        "Unauthorized: You can only suggest revisions for your own PIs",
      );
    }

    // Cache old rates for reference
    const rateMap = {};
    pi.items.forEach((i) => {
      rateMap[i.product_id] = i.rate;
    });

    const suggestions = [];

    /**
     * For each requested item, suggest optimal allocation
     */
    for (const item of items) {
      if (!item.product_id || !item.qty || item.qty <= 0) {
        throw new Error("Invalid item payload: product_id and qty required");
      }

      const requestedQty = Number(item.qty);
      const providedRate = normalizeRevisionRate(item.rate);
      const fallbackRate = normalizeRevisionRate(rateMap[item.product_id]);
      const rate = providedRate !== null ? providedRate : fallbackRate;
      const effectiveRate = rate !== null ? rate : 0;

      // Check if it's Vitton collection
      const product = await LeatherProduct.findOne({
        where: { id: item.product_id },
        include: [
          {
            model: CollectionSeries,
            as: "series",
            include: [
              {
                model: SubCollection,
                as: "subCollection",
                include: [
                  {
                    model: MainCollection,
                    as: "mainCollection",
                    attributes: ["name"],
                  },
                ],
              },
            ],
          },
        ],
        transaction: t,
      });

      const isVitton = product?.series?.subCollection?.mainCollection?.name?.toLowerCase().includes('vitton');

      if (isVitton) {
        // For Vitton, allocate directly from the roll stock up to the available qty
        const stock = await LeatherStock.findOne({
          where: { product_id: item.product_id },
          attributes: ['available_qty'],
          order: [['available_qty', 'DESC']],
          transaction: t,
          lock: t.LOCK.SHARE,
        });

        if (!stock || stock.available_qty <= 0) {
          suggestions.push({
            product_id: item.product_id,
            requested_qty: requestedQty,
            allocated_qty: 0,
            difference: -requestedQty,
            difference_abs: Math.abs(requestedQty),
            hides: [],
            rate,
            unit: "mtr",
            reason: "No available roll stock",
          });
          continue;
        }

        if (requestedQty > stock.available_qty) {
          suggestions.push({
            product_id: item.product_id,
            requested_qty: requestedQty,
            allocated_qty: 0,
            difference: -requestedQty,
            difference_abs: Math.abs(requestedQty),
            hides: [],
            rate,
            unit: "mtr",
            reason: `Insufficient Vitton roll stock. Available roll size is ${stock.available_qty} mtr, requested ${requestedQty} mtr.`,
          });
          continue;
        }

        // Allocate the requested portion of the roll when stock is sufficient
        suggestions.push({
          product_id: item.product_id,
          leather_code: item.leather_code,
          requested_qty: requestedQty,
          allocated_qty: requestedQty,
          difference: 0,
          difference_abs: 0,
          within_tolerance: true,
          hides: [{ hide_id: "roll", hide_qty: requestedQty, batch_no: "ROLL" }],
          rate: effectiveRate,
          unit: "mtr",
          line_amount: Number((requestedQty * effectiveRate).toFixed(2)),
        });
        continue;
      }

      // Non-Vitton logic
      const hideStocks = await LeatherHideStock.findAll({
        where: {
          product_id: item.product_id,
          status: "AVAILABLE",
        },
        attributes: ["id", "hide_id", "qty", "batch_no"],
        transaction: t,
        lock: t.LOCK.SHARE,
      });

      const existingItem = pi.items.find(
        (currentItem) => currentItem.product_id === item.product_id,
      );
      const revisionPlan = buildRevisitAllocationPlan({
        existingItem,
        requestedQty,
        availableHideStocks: hideStocks,
      });
      const requiredAdditionalQty = Math.max(
        0,
        requestedQty -
          revisionPlan.preservedBatchInfo.reduce(
            (sum, batch) => sum + Number(batch.qty || 0),
            0,
          ),
      );

      if (hideStocks.length === 0 && requiredAdditionalQty > 0) {
        suggestions.push({
          product_id: item.product_id,
          requested_qty: requestedQty,
          allocated_qty: revisionPlan.allocatedQty,
          difference: Number((revisionPlan.allocatedQty - requestedQty).toFixed(2)),
          difference_abs: Math.abs(revisionPlan.allocatedQty - requestedQty),
          hides: [...revisionPlan.preservedBatchInfo, ...revisionPlan.additionalBatchInfo].map((h) => ({
            hide_id: h.hide_id,
            hide_qty: h.qty,
            batch_no: h.batch_no,
          })),
          rate: effectiveRate,
          reason: "No available hides",
        });
        continue;
      }

      if (requiredAdditionalQty > 0 && revisionPlan.additionalQty < requiredAdditionalQty) {
        suggestions.push({
          product_id: item.product_id,
          requested_qty: requestedQty,
          allocated_qty: revisionPlan.allocatedQty,
          difference: Number((revisionPlan.allocatedQty - requestedQty).toFixed(2)),
          difference_abs: Math.abs(revisionPlan.allocatedQty - requestedQty),
          hides: [...revisionPlan.preservedBatchInfo, ...revisionPlan.additionalBatchInfo].map((h) => ({
            hide_id: h.hide_id,
            hide_qty: h.qty,
            batch_no: h.batch_no,
          })),
          rate: effectiveRate,
          unit: "sqft",
          reason: "Insufficient available hide stock for the additional quantity",
        });
        continue;
      }

      suggestions.push({
        product_id: item.product_id,
        leather_code: item.leather_code,
        requested_qty: requestedQty,
        allocated_qty: revisionPlan.allocatedQty,
        difference: Number((revisionPlan.allocatedQty - requestedQty).toFixed(2)),
        difference_abs: Math.abs(revisionPlan.allocatedQty - requestedQty),
        within_tolerance: true,
        hides: [...revisionPlan.preservedBatchInfo, ...revisionPlan.additionalBatchInfo].map((h) => ({
          hide_id: h.hide_id,
          hide_qty: h.qty,
          batch_no: h.batch_no,
        })),
        rate: effectiveRate,
        unit: "sqft",
        line_amount: Number((revisionPlan.allocatedQty * effectiveRate).toFixed(2)),
      });
    }

    await t.rollback(); // Rollback to avoid any side effects

    res.json({
      suggestions,
      message: "Allocation suggestions computed successfully",
    });
  } catch (err) {
    await t.rollback();
    console.error("Suggest Revisit Error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.revisitPI = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { id } = req.params;
    const {
      items,
      billing_address,
      shipping_address,
      delivery_address,
      transport_amount,
      revision_reason,
      requires_reapproval,
    } = req.body;

    console.log("REVISIT PI REQUEST:", {
      id,
      billing_address,
      shipping_address,
      delivery_address,
      transport_amount,
      revision_reason,
      requires_reapproval,
      hasItems: Array.isArray(items),
    });

    const pi = await ProformaInvoice.findByPk(id, {
      include: [{ model: PIItem, as: "items" }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pi) throw new Error("PI not found");
    if (!["ACTIVE", "PENDING_APPROVAL", "CONFIRMED"].includes(pi.status)) {
      throw new Error(
        "PI can only be revisited if status is ACTIVE, PENDING_APPROVAL, or CONFIRMED",
      );
    }
    if (req.user.role === "BUSINESS_EXECUTIVE" && pi.created_by !== req.user.id) {
      throw new Error("Unauthorized: You can only revise your own PIs");
    }

    const hasRevisionInput =
      Array.isArray(items) ||
      billing_address !== undefined ||
      shipping_address !== undefined ||
      delivery_address !== undefined ||
      transport_amount !== undefined ||
      revision_reason !== undefined ||
      requires_reapproval !== undefined;

    if (!hasRevisionInput) {
      throw new Error("No revision data provided");
    }

    const currentRevisionNo = Number(pi.revision_no || 0) + 1;
    const revisedPiPayload = buildRevisionPiData({
      originalPi: pi.toJSON(),
      transportAmount: transport_amount ?? pi.transport_amount ?? 0,
      revisionReason: revision_reason,
      requiresReapproval: requires_reapproval !== undefined ? Boolean(requires_reapproval) : true,
      revisionNo: currentRevisionNo,
      createdBy: req.user?.id ?? pi.created_by,
    });

    if (billing_address !== undefined) revisedPiPayload.billing_address = billing_address;
    if (shipping_address !== undefined) revisedPiPayload.shipping_address = shipping_address;
    if (delivery_address !== undefined) revisedPiPayload.delivery_address = delivery_address;

    const revisedPi = await ProformaInvoice.create(revisedPiPayload, { transaction: t });

    const revisionItems = Array.isArray(items)
      ? items.map((item) => ({
          product_id: Number(item.product_id),
          qty: Number(item.qty),
          rate: item.rate !== undefined && item.rate !== null && item.rate !== "" ? Number(item.rate) : null,
          batch_info: item.batch_info || null,
          surcharge: Number(item.surcharge || 0),
        }))
      : [];

    if (revisionItems.length > 0) {
      for (const item of revisionItems) {
        if (!item.product_id || !Number.isFinite(item.qty) || item.qty <= 0) {
          throw new Error("Invalid item payload");
        }

        await PIItem.create(
          {
            pi_id: revisedPi.id,
            product_id: item.product_id,
            qty: item.qty,
            rate: item.rate,
            batch_info: item.batch_info,
            surcharge: item.surcharge || 0,
          },
          { transaction: t },
        );
      }
    } else {
      for (const item of pi.items || []) {
        await PIItem.create(
          {
            pi_id: revisedPi.id,
            product_id: item.product_id,
            qty: item.qty,
            rate: item.rate,
            batch_info: item.batch_info,
            surcharge: item.surcharge || 0,
          },
          { transaction: t },
        );
      }
    }

    // Fetch the revised PI with all its items to create an order form
    const revisedPiWithItems = await ProformaInvoice.findByPk(revisedPi.id, {
      include: [{ model: PIItem, as: "items" }],
      transaction: t,
    });

    // Create an order form snapshot for the revised PI
    await createOrderFormSnapshotFromPI(revisedPiWithItems, req.user, t);

    await t.commit();
    return res.json({
      message: "PI revised successfully",
      pi_id: revisedPi.id,
      parent_pi_id: pi.id,
      revision_no: revisedPi.revision_no,
      require_reapproval: revisedPi.status === "PENDING_APPROVAL",
    });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ error: err.message });
  }
};

/**
 * Suggest batches for requested product quantity (HIDE-LEVEL)
 * Uses optimal hide combination selection algorithm
 */
exports.suggestBatch = async (req, res) => {
  try {
    const { items, collection_id, collection_ids } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      throw new Error("No items provided");

    const requestedCollectionIds = Array.isArray(collection_ids)
      ? collection_ids.filter(Boolean)
      : collection_id
        ? [collection_id]
        : [];

    // Check if any selected collection is Vitton
    let isVittonColl = false;
    if (requestedCollectionIds.length > 0) {
      const mainCollections = await MainCollection.findAll({
        where: { id: requestedCollectionIds },
        attributes: ['id', 'name'],
      });
      isVittonColl = mainCollections.some((mainColl) =>
        String(mainColl?.name || '').toLowerCase().includes('vitton'),
      );
      console.log('requestedCollectionIds:', requestedCollectionIds, 'isVittonColl:', isVittonColl);
    }

    // configurable tolerance in sqft (default 1 sqft)
    const TOLERANCE = 1;
    const EPSILON = 0.01;
    const response = [];

    const roundQty = (value) => Number((Number(value) || 0).toFixed(2));

    /**
     * Find all possible hide combinations and rank by closest match to requested qty
     * Returns top suggestions within tolerance, or closest matches if outside tolerance
     */
    const findOptimalHidesCombinations = (hideList, requested_qty) => {
      if (hideList.length === 0) return [];

      const normalizedRequestedQty = roundQty(requested_qty);

      // Normalize hides: ensure numeric qty and stable order (largest first helps greedy fallback)
      const normalized = hideList
        .map((h) => ({ hide_id: h.hide_id, qty: roundQty(h.qty) }))
        .filter((h) => h.qty > 0)
        .sort((a, b) => b.qty - a.qty);

      const buildCombination = (selectedHides, total) => {
        const roundedTotal = roundQty(total);
        const difference = roundQty(roundedTotal - normalizedRequestedQty);
        const absDistance = Math.abs(difference);
        return {
          allocated_qty: roundedTotal,
          difference,
          distance: absDistance,
          hides: selectedHides.map((h) => ({
            hide_id: h.hide_id,
            hide_qty: roundQty(h.qty),
          })),
          withinTolerance: absDistance <= TOLERANCE + EPSILON,
        };
      };

      const combinations = [];
      const n = normalized.length;

      // Use a scaled subset-sum style search so large batches still find exact or near-exact matches.
      const scale = 100;
      const maxCents = Math.round(
        Math.max(normalizedRequestedQty, normalizedRequestedQty + TOLERANCE) * scale + 100,
      );
      const dp = new Map([[0, []]]);

      for (const hide of normalized) {
        const hideCents = Math.round(hide.qty * scale);
        const entries = Array.from(dp.entries());
        for (const [sumCents, selectedHides] of entries) {
          const nextSumCents = sumCents + hideCents;
          if (nextSumCents <= maxCents && !dp.has(nextSumCents)) {
            dp.set(nextSumCents, [...selectedHides, hide]);
          }
        }
      }

      for (const [sumCents, selectedHides] of dp.entries()) {
        if (selectedHides.length === 0) continue;
        combinations.push(buildCombination(selectedHides, sumCents / scale));
      }

      // Sort by exact match first, then by smaller overshoot, then by closer distance.
      // This prevents a larger over-allocation (for example 110.25) from beating a true available match (101.50).
      combinations.sort((a, b) => {
        const aExact = Math.abs(a.difference) <= EPSILON;
        const bExact = Math.abs(b.difference) <= EPSILON;
        if (aExact !== bExact) return aExact ? -1 : 1;
        if (a.distance !== b.distance) return a.distance - b.distance;
        if (a.difference !== b.difference) return a.difference - b.difference;
        return b.allocated_qty - a.allocated_qty;
      });

      const exactMatch = combinations.find((c) => Math.abs(c.difference) <= EPSILON);
      if (exactMatch) {
        return [exactMatch];
      }

      // Return top 5: prioritize within tolerance, then closest matches
      const withinTolerance = combinations.filter((c) => c.withinTolerance);
      const outsideTolerance = combinations.filter((c) => !c.withinTolerance);

      return [
        ...withinTolerance.slice(0, 5),
        ...outsideTolerance.slice(0, Math.max(0, 5 - withinTolerance.length)),
      ];
    };

    // Use module-level findOptimalHidesCombinations with tolerance
    for (const { product_id, requested_qty } of items) {
      if (!product_id || requested_qty == null)
        throw new Error("product_id and requested_qty are required");

      // Check if it's Vitton collection
      const isVitton = isVittonColl;
      
      // Fallback: if not detected from collection_id, check product's main collection
      let actualIsVitton = isVitton;
      if (!actualIsVitton) {
        const product = await LeatherProduct.findOne({
          where: { id: product_id },
          include: [
            {
              model: CollectionSeries,
              as: 'series',
              include: [
                {
                  model: SubCollection,
                  as: 'subCollection',
                  include: [
                    {
                      model: MainCollection,
                      as: 'mainCollection',
                      attributes: ['name'],
                    },
                  ],
                },
              ],
            },
          ],
        });
        actualIsVitton = product?.series?.subCollection?.mainCollection?.name?.toLowerCase().includes('vitton');
      }
      
      if (actualIsVitton) {
        // For Vitton, use LeatherStock as a single "roll"
        const stock = await LeatherStock.findOne({
          where: { product_id },
          attributes: ['available_qty'],
          order: [['available_qty', 'DESC']], // Get the one with most available qty
        });
        if (!stock || stock.available_qty <= 0) {
          response.push({
            product_id,
            requested_qty,
            exactMatch: false,
            suggestions: [],
            reason: "No roll stock available",
          });
          continue;
        }
        // Create suggestion for Vitton roll, even if partial
        const allocated = Math.min(requested_qty, stock.available_qty);
        const suggestion = {
          suggestion_id: "ROLL_0",
          batch_no: "ROLL",
          allocated_qty: allocated,
          difference: allocated - requested_qty,
          distance: Math.abs(allocated - requested_qty),
          hides: [{ hide_id: "roll", hide_qty: allocated }],
          withinTolerance: true, // Always true for Vitton direct approval
          isBestMatch: true
        };
        response.push({
          product_id,
          requested_qty,
          exactMatch: false,
          suggestions: [suggestion],
          reason: "Roll stock available",
        });
        continue;
      } else {
        // Original logic for hides
        hides = await LeatherHideStock.findAll({
          where: { product_id, status: "AVAILABLE" },
          attributes: ["batch_no", "qty", "hide_id"],
          raw: true,
        });
      }

      if (!hides.length) {
        response.push({
          product_id,
          requested_qty,
          exactMatch: false,
          suggestions: [],
          reason: actualIsVitton ? "No available roll stock" : "No available hides",
        });
        continue;
      }

      // Group hides by batch
      const batchMap = {};
      for (const h of hides) {
        if (!batchMap[h.batch_no]) batchMap[h.batch_no] = [];
        batchMap[h.batch_no].push({ qty: Number(h.qty), hide_id: h.hide_id });
      }

      const batchResults = [];

      // For each batch, find optimal hide combinations
      for (const [batch_no, hideList] of Object.entries(batchMap)) {
        const suggestions = findOptimalHidesCombinations(
          hideList,
          requested_qty,
          TOLERANCE,
        );

        if (suggestions.length === 0) {
          batchResults.push({
            batch_no,
            allocated_qty: 0,
            difference: -requested_qty,
            hides: [],
            reason: "No valid hide combinations",
          });
        } else {
          // Mark the best one (closest match)
          suggestions[0].isBestMatch = true;
          batchResults.push({
            batch_no,
            suggestions: suggestions,
            bestSuggestion: suggestions[0],
          });
        }
      }

      if (!batchResults.length) {
        response.push({
          product_id,
          requested_qty,
          exactMatch: false,
          suggestions: [],
          reason: "No valid hide combinations",
        });
        continue;
      }

      // Check for exact matches (difference = 0)
      const exactMatches = [];
      for (const batch of batchResults) {
        if (batch.bestSuggestion && batch.bestSuggestion.difference === 0) {
          exactMatches.push(batch);
        }
      }

      if (exactMatches.length) {
        response.push({
          product_id,
          requested_qty,
          exactMatch: true,
          suggestions: exactMatches.map((b) => ({
            batch_no: b.batch_no,
            ...b.bestSuggestion,
          })),
        });
        continue;
      }

      // Get all suggestions from all batches, ranked by best match
      const allSuggestions = [];
      for (const batch of batchResults) {
        if (batch.suggestions) {
          batch.suggestions.forEach((s,i) => {
            allSuggestions.push({
              suggestion_id: `${batch.batch_no}_${i}`,
              batch_no: batch.batch_no,
              ...s,
            });
          });
        }
      }

      allSuggestions.sort((a, b) => a.distance - b.distance);

      response.push({
        product_id,
        requested_qty,
        exactMatch: false,
        suggestions: allSuggestions.slice(0, 5),
        reason:
          "Multiple combinations available, ranked by closeness to requested quantity",
      });
    }

    res.json(response);
  } catch (err) {
    console.error("suggestBatch error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.createPIConfirmed = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const {
      customer_id,
      items,
      price_type,
      company_name,
      price_list,
      location,
      perforation_qty,
      perforation_amount,
      perforation_payment_status,
    } = req.body;
    const normalizedPriceType = String(price_type || "").trim().toUpperCase();
    const normalizedPriceList = String(price_list || "").trim().toUpperCase();

    if (!customer_id) throw new Error("customer_id required");
    if (!normalizedPriceType) throw new Error("price_type required");
    if (!["DP", "RRP", "ARCH"].includes(normalizedPriceType))
      throw new Error("Invalid price_type: " + price_type);
    if (!Array.isArray(items) || items.length === 0)
      throw new Error("No items provided");
    const company = company_name || COMPANY.MARVIN;
    const priceList = normalizedPriceList || company;

    if (!COMPANY_LIST.includes(company)) {
      throw new Error("Invalid company_name");
    }
    if (!COMPANY_LIST.includes(priceList)) {
      throw new Error("Invalid price_list: " + price_list);
    }

    // 1️⃣ Create PI
    // 🔐 RBAC: Set PI creator
    const pi = await ProformaInvoice.create(
      {
        customer_id,
        company_name: company,
        created_by: req.user.id,
        location,
        perforation_qty: Number(perforation_qty || 0),
        perforation_amount: Number(
          perforation_amount || (Number(perforation_qty || 0) > 0 ? Number(perforation_qty || 0) * 50 : 0),
        ),
        perforation_payment_status,
        status: "PENDING_APPROVAL",
        expires_at: new Date(Date.now() + 7 * 86400000),
      },
      { transaction: t },
    );

    // 2️⃣ Process each item
    let allVitton = true;
    for (const item of items) {
      const { product_id, batch_no, hides, collection_series_id, requested_qty } = item;
      if (!collection_series_id) {
        throw new Error(
          `collection_series_id required for product ${product_id} batch ${batch_no}`,
        );
      }

      if (!Array.isArray(hides) || hides.length === 0) {
        throw new Error(
          `No hides selected for product ${product_id} batch ${batch_no}`,
        );
      }

      // Check if Vitton and roll
      const product = await LeatherProduct.findOne({
        where: { id: product_id },
        include: [
          {
            model: CollectionSeries,
            as: 'series',
            include: [
              {
                model: SubCollection,
                as: 'subCollection',
                include: [
                  {
                    model: MainCollection,
                    as: 'mainCollection',
                    attributes: ['name'],
                  },
                ],
              },
            ],
          },
        ],
        transaction: t,
      });

      const isVittonRoll = product?.series?.subCollection?.mainCollection?.name?.toLowerCase().includes('vitton') && hides[0].hide_id === 'roll';

      console.log('Product lookup result:', {
        product_id,
        product_found: !!product,
        main_collection_name: product?.series?.subCollection?.mainCollection?.name,
        hide_id: hides[0].hide_id,
        isVittonRoll
      });

      if (!isVittonRoll) allVitton = false;

      let allocatedQty = 0;
      const batchInfo = [];

      if (isVittonRoll) {
        // For Vitton roll, allocate from LeatherStock (cap to requested quantity)
        const requestedQty = Number(requested_qty) || 0;
        allocatedQty = Math.min(hides[0].hide_qty, requestedQty || hides[0].hide_qty);
        batchInfo.push({
          hide_id: 'roll',
          batch_no: 'ROLL',
          qty: allocatedQty,
        });

        // Update stock for Vitton
        const stock = await LeatherStock.findOne({
          where: { product_id },
          order: [['available_qty', 'DESC']],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!stock || stock.available_qty < allocatedQty) {
          if (isVittonRoll) {
            allocatedQty = stock ? stock.available_qty : 0;
          } else {
            throw new Error(`Insufficient stock for product ${product_id}`);
          }
        }

        if (allocatedQty > 0) {
          stock.available_qty -= allocatedQty;
          stock.reserved_qty += allocatedQty;
          await stock.save({ transaction: t });
        }
      } else {
        // 🔒 Lock selected hides
        const hideIds = hides.map((h) => h.hide_id);
        const hideRecords = await LeatherHideStock.findAll({
          where: { hide_id: hideIds, status: "AVAILABLE" },
          transaction: t,
          lock: t.LOCK.UPDATE,
          order: [["id", "ASC"]],
        });

        if (hideRecords.length !== hides.length) {
          throw new Error(
            `Some hides are no longer available for batch ${batch_no}`,
          );
        }

        // 3️⃣ Reserve hides
        for (const h of hideRecords) {
          const hideQty = hides.find((x) => x.hide_id === h.hide_id).hide_qty;

          allocatedQty += hideQty;
          batchInfo.push({
            hide_id: h.hide_id,
            batch_no,
            qty: hideQty,
          });

          // Update hide stock
          h.qty -= hideQty;
          if (h.qty <= 0) h.status = "RESERVED";
          await h.save({ transaction: t });
        }

        // 4️⃣ Update product stock
        const stock = await LeatherStock.findOne({
          where: { product_id },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!stock || stock.available_qty < allocatedQty) {
          throw new Error(`Insufficient stock for product ${product_id}`);
        }

        stock.available_qty -= allocatedQty;
        stock.reserved_qty += allocatedQty;
        await stock.save({ transaction: t });
      }

      // 5️⃣ Fetch price
      const price = await CollectionPrice.findOne({
        where: {
          collection_series_id,
          price_type: normalizedPriceType,
          is_active: true,
          price_list: priceList,
        },
        transaction: t,
      });

      if (!price)
        throw new Error(
          `Price not found for ${normalizedPriceType} (collection_series_id=${collection_series_id}, price_list=${priceList})`,
        );

      // 6️⃣ Create PI Item
      await PIItem.create(
        {
          pi_id: pi.id,
          product_id,
          qty: allocatedQty,
          rate: price.price,
          batch_info: batchInfo,
        },
        { transaction: t },
      );
    }

    // Vitton PIs go to pending approval like others
    // if (allVitton) {
    //   await pi.update({ status: "APPROVED" }, { transaction: t });
    // }

    await t.commit();
    res.status(201).json({
      message: allVitton ? "PI created & auto-approved" : "PI created & sent for approval",
      pi_id: pi.id,
    });
  } catch (err) {
    await t.rollback();
    console.error("createPIConfirmed error:", err);
    res.status(400).json({ error: err.message });
  }
};
exports.adminApprovePI = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { id } = req.params;
    const {
      transport_type_id,
      transport_id,
      weight_kg,
      transport_name,
      transport_payment_status,
      delivery_address,
      billing_address,
      shipping_address,
      receiver_courier_name,
      perforation_qty,
      perforation_payment_status,
      transport_amount,
      perforation_amount,
      updated_items, // New: allow admin to update hide allocations
      manual_item_prices, // New: manual price overrides
      item_surcharges, // New: surcharges for items
    } = req.body;

    console.log("ADMIN APPROVE PI REQUEST:", {
      id,
      delivery_address,
      billing_address,
      shipping_address,
      transport_type_id,
      transport_id,
      transport_amount,
      perforation_qty,
      perforation_amount,
      perforation_payment_status,
      hasUpdatedItems: !!updated_items,
      hasManualPrices: !!manual_item_prices,
      hasSurcharges: !!item_surcharges,
    });

    const pi = await ProformaInvoice.findByPk(id, {
      include: [
        {
          model: PIItem,
          as: "items",
        },
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pi) throw new Error("PI not found");
    if (pi.status !== "PENDING_APPROVAL") {
      throw new Error("Only PENDING_APPROVAL PI can be approved");
    }

    // 🔹 Apply manual prices and surcharges to items
    if ((manual_item_prices && Object.keys(manual_item_prices).length > 0) ||
        (item_surcharges && Object.keys(item_surcharges).length > 0)) {
      console.log("Applying manual prices and surcharges to items");
      
      for (const item of pi.items) {
        const updates = {};
        
        // Apply manual price if provided
        if (manual_item_prices && manual_item_prices[item.id]) {
          updates.rate = Number(manual_item_prices[item.id]);
          console.log(`Item ${item.id}: Manual rate updated to ₹${updates.rate}`);
        }
        
        // Apply surcharge if provided
        if (item_surcharges && item_surcharges[item.id]) {
          updates.surcharge = Number(item_surcharges[item.id]);
          console.log(`Item ${item.id}: Surcharge set to ₹${updates.surcharge}`);
        }
        
        // Update item if any changes
        if (Object.keys(updates).length > 0) {
          await item.update(updates, { transaction: t });
        }
      }
    }

    // 🔹 Handle admin updates to hide allocations if provided
    if (updated_items && Array.isArray(updated_items)) {
      console.log("Admin updating hide allocations for PI items");
      
      // First, restore all previously allocated stock
      const productIds = pi.items.map((i) => i.product_id);
      const stocks = await LeatherStock.findAll({
        where: { product_id: { [Op.in]: productIds } },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const stockMap = {};
      stocks.forEach((s) => (stockMap[s.product_id] = s));

      for (const oldItem of pi.items) {
        const stock = stockMap[oldItem.product_id];
        if (stock) {
          stock.available_qty += oldItem.qty;
          stock.reserved_qty -= oldItem.qty;
          if (stock.reserved_qty < 0) stock.reserved_qty = 0;
          await stock.save({ transaction: t });
        }

        // Restore hide stock
        let batches = [];
        if (Array.isArray(oldItem.batch_info)) batches = oldItem.batch_info;
        else if (typeof oldItem.batch_info === "string") {
          try { batches = JSON.parse(oldItem.batch_info); } catch { batches = []; }
        }

        for (const b of batches) {
          if (!b.hide_id) continue;
          const hideStock = await LeatherHideStock.findOne({
            where: { hide_id: b.hide_id },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (hideStock) {
            hideStock.qty += b.qty;
            hideStock.status = "AVAILABLE";
            await hideStock.save({ transaction: t });
          }
        }
      }

      // Now apply the new allocations from admin
      for (const update of updated_items) {
        const { item_id, hides } = update;
        const piItem = pi.items.find(item => item.id == item_id);
        if (!piItem) continue;

        if (!Array.isArray(hides) || hides.length === 0) {
          throw new Error(`No hides provided for item ${item_id}`);
        }

        let allocatedQty = 0;
        const batchInfo = [];

        // Validate and allocate new hides
        const hideIds = hides.map((h) => h.hide_id);
        const hideRecords = await LeatherHideStock.findAll({
          where: { 
            hide_id: { [Op.in]: hideIds },
            status: "AVAILABLE" 
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
          order: [["id", "ASC"]],
        });

        if (hideRecords.length !== hides.length) {
          throw new Error(`Some hides are no longer available for item ${item_id}`);
        }

        for (const h of hideRecords) {
          const hideQty = hides.find((x) => x.hide_id === h.hide_id).hide_qty;
          allocatedQty += hideQty;
          batchInfo.push({
            id: h.id,
            hide_id: h.hide_id,
            batch_no: h.batch_no,
            qty: hideQty,
            collection_series_id: h.collection_series_id,
          });

          h.qty -= hideQty;
          h.status = "RESERVED";
          await h.save({ transaction: t });
        }

        // Update the PI item with admin's selected quantity and batch info
        // Allow admin to approve even if allocated qty differs from original qty
        console.log(`📦 Item ${item_id}: Updating qty from ${piItem.qty} to ${allocatedQty} based on admin's hide selection`);
        await piItem.update({ batch_info: batchInfo, qty: allocatedQty }, { transaction: t });

        // Update product stock
        const stock = stockMap[piItem.product_id];
        if (stock) {
          stock.available_qty -= allocatedQty;
          stock.reserved_qty += allocatedQty;
          await stock.save({ transaction: t });
        }
      }

      // Block the allocated hides
      await blockHideStockBatchItems(pi, t);
    } else {
      // No updates - proceed with original allocations
      await blockHideStockBatchItems(pi, t);
    }

    const nextTransportAmount = transport_amount ?? pi.transport_amount ?? 0;
    const nextPerforationQty = perforation_qty ?? pi.perforation_qty ?? 0;
    const nextPerforationAmount =
      perforation_amount ??
      (Number(nextPerforationQty) > 0 ? Number(nextPerforationQty) * 50 : pi.perforation_amount ?? 0);

    await pi.update(
      {
        transport_type_id,
        transport_id,
        weight_kg,
        transport_name,
        transport_payment_status,
        delivery_address,
        billing_address,
        shipping_address,
        receiver_courier_name,
        transport_amount: nextTransportAmount,
        perforation_qty: nextPerforationQty,
        perforation_amount: nextPerforationAmount,
        perforation_payment_status: perforation_payment_status ?? pi.perforation_payment_status,
        status: "ACTIVE",
        confirmed_at: new Date(),
      },
      { transaction: t },
    );

    // Reload and log persisted perforation values for debugging
    await pi.reload({ transaction: t });
    console.log("PI persisted perforation:", {
      id: pi.id,
      perforation_qty: pi.perforation_qty,
      perforation_amount: pi.perforation_amount,
      transport_amount: pi.transport_amount,
    });

    await t.commit();
    res.json({
      message: "PI approved successfully",
      pi_id: pi.id,
    });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ error: err.message });
  }
};

/**
 * List available hides for admin to reallocate during approval
 * Supports search by hide_id and pagination
 */
exports.listAvailableHidesForReallocation = async (req, res) => {
  try {
    const { product_id, search, page = 1, limit = 50, exclude_pi_id } = req.query;
    
    if (!product_id) {
      return res.status(400).json({ error: "product_id is required" });
    }

    const where = {
      product_id: Number(product_id),
      status: "AVAILABLE",
      qty: { [Op.gt]: 0 },
    };

    // Add search filter if provided
    if (search && search.trim()) {
      where.hide_id = { [Op.iLike]: `%${search.trim()}%` };
    }

    const offset = (Number(page) - 1) * Number(limit);

    const hides = await LeatherHideStock.findAll({
      where,
      attributes: ["id", "product_id", "hide_id", "qty", "batch_no", "batch_id", "createdAt"],
      include: [
        {
          model: LeatherProduct,
          as: "product",
          attributes: ["leather_code", "color"],
        },
        {
          model: Batch,
          as: "batch",
          attributes: ["batch_no", "collection_series_id"],
          include: [
            {
              model: CollectionSeries,
              as: "series",
              attributes: ["id", "name"],
            }
          ]
        }
      ],
      order: [["qty", "DESC"], ["createdAt", "ASC"]],
      limit: Number(limit),
      offset: offset,
    });

    const reservedHideIds = await collectReservedHideIdsInPendingOrders(
      product_id,
      exclude_pi_id,
    );

    const lockedHides = reservedHideIds.length
      ? await LeatherHideStock.findAll({
          where: {
            product_id: Number(product_id),
            status: "RESERVED",
            [Op.and]: [
              { hide_id: { [Op.in]: reservedHideIds } },
              ...(search && search.trim()
                ? [{ hide_id: { [Op.iLike]: `%${search.trim()}%` } }]
                : []),
            ],
          },
          attributes: ["id", "product_id", "hide_id", "qty", "batch_no", "batch_id", "createdAt"],
          include: [
            {
              model: LeatherProduct,
              as: "product",
              attributes: ["leather_code", "color"],
            },
            {
              model: Batch,
              as: "batch",
              attributes: ["batch_no", "collection_series_id"],
              include: [
                {
                  model: CollectionSeries,
                  as: "series",
                  attributes: ["id", "name"],
                }
              ]
            }
          ],
          order: [["qty", "DESC"], ["createdAt", "ASC"]],
        })
      : [];

    const total = await LeatherHideStock.count({ where });

    res.json({
      hides: hides.map((h) => ({
        id: h.id,
        product_id: h.product_id,
        hide_id: h.hide_id,
        qty: h.qty,
        batch_no: h.batch_no,
        leather_code: h.product?.leather_code,
        color: h.product?.color,
        collection_series_id: h.batch?.collection_series_id || null,
        collection_name: h.batch?.series?.name || "N/A",
        created_at: h.createdAt,
      })),
      locked_hides: lockedHides.map((h) => ({
        id: h.id,
        hide_id: h.hide_id,
        qty: h.qty,
        batch_no: h.batch_no,
        leather_code: h.product?.leather_code,
        color: h.product?.color,
        collection_series_id: h.batch?.collection_series_id || null,
        collection_name: h.batch?.series?.name || "N/A",
        created_at: h.createdAt,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error("listAvailableHidesForReallocation error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.unlockHideStock = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { hideId } = req.params;
    const { target_pi_id } = req.body;

    if (!target_pi_id) {
      throw new Error("target_pi_id is required to unlock a hide");
    }

    const hideStock = await unlockReservedHide(
      hideId,
      target_pi_id,
      req.user?.id,
      t,
    );

    await t.commit();

    res.json({
      message: "Hide unlocked successfully",
      hide: {
        id: hideStock.id,
        hide_id: hideStock.hide_id,
        status: hideStock.status,
        batch_no: hideStock.batch_no,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("unlockHideStock error:", err);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Admin-only: Update hide stock details
 */
exports.adminUpdateHideStock = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { hide_id, qty, batch_no, grade, remarks, status } = req.body;

    const hideStock = await LeatherHideStock.findByPk(id, { transaction: t });
    if (!hideStock) {
      throw new Error("Hide stock not found");
    }

    // Validate status
    if (status && !["AVAILABLE", "RESERVED", "BLOCKED"].includes(status)) {
      throw new Error("Invalid status. Must be AVAILABLE, RESERVED, or BLOCKED");
    }

    // Update hide stock
    await hideStock.update({
      hide_id: hide_id || hideStock.hide_id,
      qty: qty !== undefined ? qty : hideStock.qty,
      batch_no: batch_no || hideStock.batch_no,
      grade: grade !== undefined ? grade : hideStock.grade,
      remarks: remarks !== undefined ? remarks : hideStock.remarks,
      status: status || hideStock.status,
    }, { transaction: t });

    await t.commit();

    res.json({
      message: "Hide stock updated successfully",
      hide: {
        id: hideStock.id,
        hide_id: hideStock.hide_id,
        qty: hideStock.qty,
        batch_no: hideStock.batch_no,
        grade: hideStock.grade,
        remarks: hideStock.remarks,
        status: hideStock.status,
      }
    });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ error: err.message });
  }
};

/**
 * Admin-only: Update leather stock details
 */
exports.adminUpdateLeatherStock = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { total_qty, available_qty, reserved_qty, location, estimated_delivery_date } = req.body;

    const leatherStock = await LeatherStock.findByPk(id, { transaction: t });
    if (!leatherStock) {
      throw new Error("Leather stock not found");
    }

    // Validate quantities
    const newTotalQty = total_qty !== undefined ? total_qty : leatherStock.total_qty;
    const newAvailableQty = available_qty !== undefined ? available_qty : leatherStock.available_qty;
    const newReservedQty = reserved_qty !== undefined ? reserved_qty : leatherStock.reserved_qty;

    if (newAvailableQty + newReservedQty > newTotalQty) {
      throw new Error("Available + Reserved quantity cannot exceed total quantity");
    }

    // Validate location
    if (location && !["Bangalore", "Delhi", "Mumbai", "Western Colours", "Italy"].includes(location)) {
      throw new Error("Invalid location. Must be Bangalore, Delhi, Mumbai, Western Colours, or Italy");
    }

    // Update leather stock
    await leatherStock.update({
      total_qty: newTotalQty,
      available_qty: newAvailableQty,
      reserved_qty: newReservedQty,
      location: location || leatherStock.location,
      estimated_delivery_date: estimated_delivery_date !== undefined ? estimated_delivery_date : leatherStock.estimated_delivery_date,
    }, { transaction: t });

    await t.commit();

    res.json({
      message: "Leather stock updated successfully",
      stock: {
        id: leatherStock.id,
        product_id: leatherStock.product_id,
        total_qty: leatherStock.total_qty,
        available_qty: leatherStock.available_qty,
        reserved_qty: leatherStock.reserved_qty,
        location: leatherStock.location,
        estimated_delivery_date: leatherStock.estimated_delivery_date,
      }
    });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ error: err.message });
  }
};

/**
 * Admin-only: Update batch details
 */
exports.adminUpdateBatch = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { batch_no, description, status } = req.body;

    const batch = await Batch.findByPk(id, { transaction: t });
    if (!batch) {
      throw new Error("Batch not found");
    }

    // Validate status
    if (status && !["ACTIVE", "CLOSED", "ARCHIVED"].includes(status)) {
      throw new Error("Invalid status. Must be ACTIVE, CLOSED, or ARCHIVED");
    }

    // Check if batch_no is unique if being updated
    if (batch_no && batch_no !== batch.batch_no) {
      const existingBatch = await Batch.findOne({
        where: { batch_no },
        transaction: t
      });
      if (existingBatch) {
        throw new Error("Batch number already exists");
      }
    }

    // Update batch
    await batch.update({
      batch_no: batch_no || batch.batch_no,
      description: description !== undefined ? description : batch.description,
      status: status || batch.status,
    }, { transaction: t });

    await t.commit();

    res.json({
      message: "Batch updated successfully",
      batch: {
        id: batch.id,
        batch_no: batch.batch_no,
        product_id: batch.product_id,
        collection_series_id: batch.collection_series_id,
        description: batch.description,
        status: batch.status,
      }
    });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ error: err.message });
  }
};

exports.updatePIItem = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { piId, itemId } = req.params;
    const { batch_info, hides, hides_to_release = [], hides_to_block = [] } = req.body;

    console.log(`🔄 Updating PI ${piId} Item ${itemId}`);
    console.log("📦 Received batch_info:", JSON.stringify(batch_info, null, 2));
    console.log("📦 Received hides:", JSON.stringify(hides, null, 2));
    console.log(`📊 Frontend sent: batch_info=${batch_info?.length || 'N/A'} items, hides=${hides?.length || 'N/A'} items`);

    const pi = await ProformaInvoice.findByPk(piId, { transaction: t });
    if (!pi) {
      throw new Error("PI not found");
    }

    const item = await PIItem.findOne({
      where: { id: itemId, pi_id: piId },
      transaction: t,
    });
    if (!item) {
      throw new Error("PI item not found");
    }

    console.log("✓ Found item:", { id: item.id, product_id: item.product_id, current_batch_info: item.batch_info });

    let updatedBatchInfo = [];
    const currentItemQty = Number(item.qty || 0);
    let updatedQty = currentItemQty;

    if (Array.isArray(batch_info)) {
      updatedBatchInfo = batch_info;
    } else if (Array.isArray(hides)) {
      updatedBatchInfo = hides.map((h) => ({
        hide_id: h.hide_id,
        batch_no: h.batch_no,
        qty: Number(h.hide_qty),
        collection_series_id: h.collection_series_id || null,
      }));
    } else {
      throw new Error("batch_info or hides array is required");
    }

    if (req.body.qty !== undefined) {
      updatedQty = resolveUpdatedItemQty({
        incomingQty: req.body.qty,
        currentQty: currentItemQty,
      });
    } else {
      updatedQty = currentItemQty;
    }

    updatedBatchInfo = normalizeBatchInfoForQty(updatedBatchInfo, updatedQty);
    updatedQty = updatedBatchInfo.reduce((sum, b) => sum + Number(b.qty || 0), 0);
    updatedQty = Math.min(updatedQty, currentItemQty || updatedQty);

    console.log(`📦 Final updatedBatchInfo has ${updatedBatchInfo.length} hides:`, updatedBatchInfo.map(b => ({ hide_id: b.hide_id, qty: b.qty })));
    // Otherwise, calculate by comparing old vs new allocations
    let hideIDsToRelease = hides_to_release;
    let hideIDsToBlock = hides_to_block;

    if (hideIDsToRelease.length === 0 || hideIDsToBlock.length === 0) {
      // Calculate release/block if not explicitly provided
      const oldBatches = parseBatchInfo(item.batch_info);
      const oldHideIDs = oldBatches.map(b => b.hide_id).filter(Boolean);
      const newHideIDs = updatedBatchInfo.map(b => b.hide_id).filter(Boolean);
      
      if (hideIDsToRelease.length === 0) {
        hideIDsToRelease = oldHideIDs.filter(id => !newHideIDs.includes(id));
      }
      if (hideIDsToBlock.length === 0) {
        hideIDsToBlock = newHideIDs.filter(id => !oldHideIDs.includes(id));
      }
    }

    // Release hides explicitly marked for release
    console.log("🔓 Releasing hides:", hideIDsToRelease);
    for (const hideId of hideIDsToRelease) {
      console.log(`  Searching for hide_id: ${hideId}`);
      const hideStock = await LeatherHideStock.findOne({
        where: { hide_id: hideId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (hideStock) {
        console.log(`    ✓ Found! Current status: ${hideStock.status}`);
        if (hideStock.status === "RESERVED") {
          hideStock.status = "AVAILABLE";
          hideStock.updated_by_admin = true;
          await hideStock.save({ transaction: t });
          console.log(`    ✓ Released! Status: RESERVED → AVAILABLE`);
        } else {
          console.log(`    ⚠ Status is "${hideStock.status}", not RESERVED. No action taken.`);
        }
      } else {
        console.log(`    ✗ Hide not found in leather_hide_stocks table!`);
      }
    }

    // Release all old allocations that are not in the new selections
    console.log("🔄 Checking old batch allocations for release...");
    const oldBatches = parseBatchInfo(item.batch_info);
    console.log("  Old batches in DB:", JSON.stringify(oldBatches.map(b => ({ hide_id: b.hide_id, qty: b.qty, batch_no: b.batch_no }))));
    
    for (const b of oldBatches) {
      if (!b.hide_id) {
        console.log(`  Skipping batch entry without hide_id`);
        continue;
      }
      
      // Skip if this hide is still being used
      if (updatedBatchInfo.some(nb => nb.hide_id === b.hide_id)) {
        console.log(`  ✓ Hide ${b.hide_id} still in use, skipping release`);
        continue;
      }
      
      console.log(`  Releasing old hide: ${b.hide_id}`);
      const hideStock = await LeatherHideStock.findOne({
        where: { hide_id: b.hide_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      
      if (hideStock) {
        console.log(`    ✓ Found in DB. Current status: ${hideStock.status}`);
        if (hideStock.status === "RESERVED") {
          hideStock.status = "AVAILABLE";
          hideStock.updated_by_admin = true;
          await hideStock.save({ transaction: t });
          console.log(`    ✓ Released! Status: RESERVED → AVAILABLE`);
        } else {
          console.log(`    ⚠ Status is "${hideStock.status}", not RESERVED`);
        }
      } else {
        console.log(`    ✗ Hide not found in leather_hide_stocks!`);
      }
    }

    // Reassign reserved hides selected from other pending orders to this PI
    const reservedHideIds = updatedBatchInfo
      .map((b) => b.hide_id)
      .filter(Boolean);
    const reassignments = await reassignReservedHidesFromOtherOrders(
      piId,
      item.product_id,
      reservedHideIds,
      req.user?.id,
      t,
    );
    if (reassignments.length > 0) {
      console.log("🔁 Reassigned hides from other pending orders:", reassignments);
    }

    // Update the PI item with new batch info
    await item.update({ batch_info: updatedBatchInfo, qty: updatedQty }, { transaction: t });
    console.log("✓ Item updated in database with:", { batch_info: updatedBatchInfo, qty: updatedQty });

    // Block (reserve) new hides
    console.log(`\n🔐 BLOCKING HIDES: Total hides to block = ${updatedBatchInfo.length}`);
    console.log("Hides list:", updatedBatchInfo.map(b => ({ hide_id: b.hide_id, qty: b.qty, batch_no: b.batch_no })));
    
    let blockedCount = 0;
    let notFoundCount = 0;
    let alreadyReservedCount = 0;
    
    for (let i = 0; i < updatedBatchInfo.length; i++) {
      const b = updatedBatchInfo[i];
      if (!b.hide_id) {
        console.log(`  [${i + 1}/${updatedBatchInfo.length}] Skipping - no hide_id`);
        continue;
      }
      
      console.log(`\n  [${i + 1}/${updatedBatchInfo.length}] Processing hide: ${b.hide_id} (Qty: ${b.qty})`);
      const hideStock = await LeatherHideStock.findOne({
        where: { hide_id: b.hide_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      
      if (!hideStock) {
        console.log(`    ✗ NOT FOUND in database!`);
        notFoundCount++;
        continue;
      }
      
      console.log(`    ✓ Found! Current status: "${hideStock.status}"`);
      if (hideStock.status === "AVAILABLE") {
        hideStock.status = "RESERVED";
        await hideStock.save({ transaction: t });
        console.log(`    ✓ BLOCKED! Status changed: AVAILABLE → RESERVED`);
        blockedCount++;
      } else if (hideStock.status === "RESERVED") {
        console.log(`    ⚠ Already RESERVED (already blocked)`);
        alreadyReservedCount++;
      } else {
        console.log(`    ⚠ Status is "${hideStock.status}" (not AVAILABLE or RESERVED)`);
      }
    }
    console.log(`\n📊 Blocking Summary: ${blockedCount} blocked, ${alreadyReservedCount} already reserved, ${notFoundCount} not found`);

    await t.commit();
    console.log("✓ Transaction committed successfully");
    console.log(`📊 SUMMARY: Released ${hideIDsToRelease.length} hides, Blocked ${hideIDsToBlock.length} hides`);

    // Refresh item from database to get the latest state
    const freshItem = await PIItem.findOne({
      where: { id: itemId, pi_id: piId }
    });
    console.log("✓ Fresh item batch_info from DB:", JSON.stringify(freshItem.batch_info));

    res.json({
      message: "PI item updated successfully",
      item: freshItem,
      hides_released: hideIDsToRelease,
      hides_blocked: hideIDsToBlock,
      reassigned_hides: reassignments || [],
    });
  } catch (err) {
    await t.rollback();
    console.error("❌ Error updating PI item:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.dispatchPI = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { invoice_bill_number } = req.body;
    if (!invoice_bill_number || String(invoice_bill_number).trim() === "") {
      throw new Error("invoice_bill_number is required to dispatch a PI");
    }

    const pi = await ProformaInvoice.findByPk(req.params.id, {
      include: [
        {
          model: PIItem,
          as: "items",
          attributes: ["id", "product_id", "qty", "batch_info"],
        },
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pi) throw new Error("PI not found");
    if (!["ACTIVE", "CONFIRMED"].includes(pi.status)) {
      throw new Error("Only ACTIVE or CONFIRMED PI can be dispatched");
    }

    const productIds = pi.items.map((i) => i.product_id);
    const stocks = await LeatherStock.findAll({
      where: { product_id: { [Op.in]: productIds } },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const stockMap = {};
    stocks.forEach((s) => (stockMap[s.product_id] = s));

    for (const item of pi.items) {
      const stock = stockMap[item.product_id];
      if (!stock) continue;

      stock.reserved_qty -= item.qty;
      stock.total_qty -= item.qty;
      if (stock.reserved_qty < 0) stock.reserved_qty = 0;
      if (stock.total_qty < 0) stock.total_qty = 0;
      await stock.save({ transaction: t });
    }

    await blockHideStockBatchItems(pi, t);

    await pi.update(
      {
        status: "DISPATCHED",
        invoice_bill_number: String(invoice_bill_number).trim(),
        dispatched_at: new Date(),
      },
      { transaction: t },
    );

    await t.commit();
    res.json({ message: "PI dispatched successfully", pi_id: pi.id });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ error: err.message });
  }
};

// Return PI - Add stock back to inventory when customer returns it
exports.returnPI = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { return_reason, returned_items } = req.body;

    if (!return_reason || String(return_reason).trim() === "") {
      throw new Error("Return reason is required");
    }

    if (!Array.isArray(returned_items) || returned_items.length === 0) {
      throw new Error("Returned items are required");
    }

    const pi = await ProformaInvoice.findByPk(req.params.id, {
      include: [
        {
          model: PIItem,
          as: "items",
          attributes: ["id", "product_id", "qty", "batch_info"],
        },
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pi) throw new Error("PI not found");
    
    // Only DISPATCHED PIs can be returned
    if (pi.status !== "DISPATCHED") {
      throw new Error("Only DISPATCHED PI can be returned");
    }

    const productIds = pi.items.map((i) => i.product_id);
    const stocks = await LeatherStock.findAll({
      where: { product_id: { [Op.in]: productIds } },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const stockMap = {};
    stocks.forEach((s) => (stockMap[s.product_id] = s));

    let totalReturnedQty = 0;

    // Process each returned item
    for (const returnedItem of returned_items) {
      const item = pi.items.find(i => i.id == returnedItem.item_id);
      if (!item) continue;

      const stock = stockMap[item.product_id];
      if (!stock) continue;

      let itemReturnedQty = 0;

      // Restore hide stocks
      for (const hide of returnedItem.returned_hides) {
        const hideStock = await LeatherHideStock.findOne({
          where: { hide_id: hide.hide_id, batch_no: hide.batch_no },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!hideStock) {
          console.warn(`HideStock not found for return: hide_id=${hide.hide_id}, batch_no=${hide.batch_no}`);
          continue;
        }

        hideStock.qty += hide.qty;
        hideStock.status = "AVAILABLE";
        await hideStock.save({ transaction: t });

        itemReturnedQty += hide.qty;
      }

      // Restore overall stock
      stock.total_qty += itemReturnedQty;
      stock.available_qty = (stock.available_qty || 0) + itemReturnedQty;
      stock.reserved_qty = Math.max(0, stock.reserved_qty - itemReturnedQty);
      await stock.save({ transaction: t });

      totalReturnedQty += itemReturnedQty;
    }

    // Update PI status to RETURNED
    await pi.update(
      {
        status: "RETURNED",
        return_reason: String(return_reason).trim(),
        returned_at: new Date(),
      },
      { transaction: t },
    );

    await t.commit();
    res.json({ 
      message: "PI returned successfully and stock added back to inventory", 
      pi_id: pi.id,
      returned_qty: totalReturnedQty
    });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ error: err.message });
  }
};

exports.getPendingApprovalPIs = async (req, res) => {
  try {
    const pis = await ProformaInvoice.findAll({
      where: {
        status: "PENDING_APPROVAL",
      },
      include: [
        {
          model: PIItem,
          as: "items",
          include: [
            {
              model: LeatherProduct,
              as: "product",
              attributes: [
                "id",
                "leather_code",
                "color",
                "hsn_code",
                "image_url",
              ],
            },
          ],
        },
        {
          model: Customer,
          as: "customer",
          attributes: ["customer_name", "address"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const formattedResponse = pis.map((pi) => {
      const piJson = pi.toJSON();
      const normalizedItems = (piJson.items || []).map((item) => ({
        ...item,
        batch_info: normalizeBatchInfoForQty(item.batch_info, item.qty),
      }));

      return {
        ...piJson,
        items: normalizedItems,
      };
    });

    res.json(formattedResponse);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSalesData = async (req, res) => {
  try {
    const { period = "7d", company = "ALL", location = "" } = req.query;
    const today = new Date();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    let days = 7;
    let periodLabel = 'Last 7 Days';
    if (period === '1d' || period === 'day' || period === 'today') {
      days = 1;
      periodLabel = 'Today';
    } else if (period === '15d') {
      days = 15;
      periodLabel = 'Last 15 Days';
    } else if (period === '1m' || period === 'month') {
      days = 30;
      periodLabel = 'Last 30 Days';
    } else if (period === '7d' || period === 'week') {
      days = 7;
      periodLabel = 'Last 7 Days';
    }

    const startOfDay = new Date(endOfDay);
    startOfDay.setDate(startOfDay.getDate() - days);

    const piWhere = {
      createdAt: {
        [Op.gte]: startOfDay,
        [Op.lt]: endOfDay,
      },
      status: {
        [Op.ne]: 'CANCELLED',
      },
    };

    if (company && company !== 'ALL') {
      piWhere.company_name = company;
    }

    if (req.user?.role === 'BUSINESS_EXECUTIVE') {
      piWhere.created_by = req.user.id;
    }

    const rangePIs = await ProformaInvoice.findAll({
      where: piWhere,
      include: [
        {
          model: PIItem,
          as: 'items',
          include: [
            {
              model: LeatherProduct,
              as: 'product',
              attributes: ['leather_code', 'color'],
            },
          ],
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['customer_name', 'gst_number', 'state', 'address', 'createdAt'],
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'location'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    const visiblePIs = rangePIs.filter((pi) => matchesLocationFilter(pi, location));

    const salesData = visiblePIs.map((pi) => {
      const totalAmount = pi.items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.rate)), 0);
      const articles = pi.items.map((item) => ({
        code: item.product.leather_code,
        color: item.product.color,
        qty: Number(item.qty) || 0,
        rate: Number(item.rate) || 0,
        amount: (Number(item.qty) || 0) * (Number(item.rate) || 0),
      }));

      return {
        pi_id: pi.id,
        customer_id: pi.customer_id,
        company_name: pi.company_name || 'UNKNOWN',
        customer_name: pi.customer?.customer_name || 'Unknown',
        gst_number: pi.customer?.gst_number || 'N/A',
        state: pi.customer?.state || 'N/A',
        location: inferLocationLabel(pi),
        executive_id: pi.created_by || null,
        executive_name: pi.creator?.name || 'Unassigned',
        executive_location: pi.creator?.location || 'DEFAULT',
        status: pi.status,
        payment_status: pi.payment_status,
        amount_paid: Number(pi.amount_paid) || 0,
        total_amount: totalAmount,
        dispatched_at: pi.dispatched_at,
        articles,
        created_at: pi.createdAt,
      };
    });

    const totalPIs = salesData.length;
    const dispatchedCount = salesData.filter((pi) => pi.status === 'DISPATCHED').length;
    const totalRevenue = salesData.reduce((sum, pi) => sum + pi.total_amount, 0);
    const totalPaid = salesData.reduce((sum, pi) => sum + pi.amount_paid, 0);
    const pendingDispatchCount = totalPIs - dispatchedCount;

    const executiveMap = {};
    const locationMap = {};
    const timelineMap = {};
    const companyMap = {};

    salesData.forEach((pi) => {
      const companyKey = pi.company_name || 'UNKNOWN';
      if (!companyMap[companyKey]) {
        companyMap[companyKey] = {
          company_name: companyKey,
          total_pis: 0,
          dispatched_count: 0,
          pending_dispatch_count: 0,
          total_amount: 0,
          total_paid: 0,
          pending_payment: 0,
        };
      }
      companyMap[companyKey].total_pis += 1;
      companyMap[companyKey].dispatched_count += pi.status === 'DISPATCHED' ? 1 : 0;
      companyMap[companyKey].pending_dispatch_count += pi.status === 'DISPATCHED' ? 0 : 1;
      companyMap[companyKey].total_amount += pi.total_amount;
      companyMap[companyKey].total_paid += pi.amount_paid;
      companyMap[companyKey].pending_payment += pi.total_amount - pi.amount_paid;

      const executiveKey = pi.executive_name || 'Unassigned';
      if (!executiveMap[executiveKey]) {
        executiveMap[executiveKey] = {
          executive_name: executiveKey,
          executive_id: pi.executive_id,
          executive_location: pi.executive_location,
          total_pis: 0,
          dispatched_count: 0,
          total_amount: 0,
          total_paid: 0,
        };
      }
      executiveMap[executiveKey].total_pis += 1;
      executiveMap[executiveKey].dispatched_count += pi.status === 'DISPATCHED' ? 1 : 0;
      executiveMap[executiveKey].total_amount += pi.total_amount;
      executiveMap[executiveKey].total_paid += pi.amount_paid;

      const locationKey = pi.location || 'Unknown';
      if (!locationMap[locationKey]) {
        locationMap[locationKey] = {
          location: locationKey,
          total_pis: 0,
          dispatched_count: 0,
          total_amount: 0,
          new_customers: 0,
        };
      }
      locationMap[locationKey].total_pis += 1;
      locationMap[locationKey].dispatched_count += pi.status === 'DISPATCHED' ? 1 : 0;
      locationMap[locationKey].total_amount += pi.total_amount;

      const dayKey = toDayKey(pi.created_at);
      if (!timelineMap[dayKey]) {
        timelineMap[dayKey] = {
          date: dayKey,
          created_count: 0,
          dispatched_count: 0,
          total_amount: 0,
        };
      }
      timelineMap[dayKey].created_count += 1;
      timelineMap[dayKey].dispatched_count += pi.status === 'DISPATCHED' ? 1 : 0;
      timelineMap[dayKey].total_amount += pi.total_amount;
    });

    const customerWhere = {
      createdAt: {
        [Op.gte]: startOfDay,
        [Op.lt]: endOfDay,
      },
    };

    if (company && company !== 'ALL') {
      customerWhere.price_list = company;
    }

    if (location) {
      customerWhere[Op.or] = [
        { state: { [Op.like]: `%${location}%` } },
        { address: { [Op.like]: `%${location}%` } },
      ];
    }

    const newCustomersCount = await Customer.count({ where: customerWhere });
    const executiveCount = Object.keys(executiveMap).length;
    const locationCount = Object.keys(locationMap).length;

    const customerMap = {};
    salesData.forEach((pi) => {
      const customerKey = pi.customer_id || `unknown-${pi.pi_id}`;
      if (!customerMap[customerKey]) {
        customerMap[customerKey] = {
          customer_name: pi.customer_name,
          gst_number: pi.gst_number,
          state: pi.state,
          total_amount: 0,
          total_paid: 0,
          pending_amount: 0,
          pi_count: 0,
        };
      }
      customerMap[customerKey].total_amount += pi.total_amount;
      customerMap[customerKey].total_paid += pi.amount_paid;
      customerMap[customerKey].pending_amount += pi.total_amount - pi.amount_paid;
      customerMap[customerKey].pi_count += 1;
    });

    const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));
    const executives = Object.values(executiveMap).sort((a, b) => b.total_pis - a.total_pis);
    const locations = Object.values(locationMap).sort((a, b) => b.total_pis - a.total_pis);

    res.json({
      summary: {
        period_label: periodLabel,
        total_pis: totalPIs,
        dispatched_count: dispatchedCount,
        pending_dispatch_count: pendingDispatchCount,
        total_revenue: totalRevenue,
        total_paid: totalPaid,
        pending_payment: totalRevenue - totalPaid,
        new_customers_count: newCustomersCount,
        executive_count: executiveCount,
        location_count: locationCount,
      },
      company_breakdown: Object.values(companyMap).sort((a, b) => b.total_pis - a.total_pis),
      customers: Object.values(customerMap),
      executives,
      locations,
      timeline,
      pis: salesData,
    });
  } catch (err) {
    console.error('getSalesData error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status, amount_paid } = req.body;

    const pi = await ProformaInvoice.findByPk(id);
    if (!pi) {
      return res.status(404).json({ error: "PI not found" });
    }

    // Validate payment_status
    const validStatuses = ['NOT_PAID', 'HALF_PAID', 'FULL_PAID'];
    if (!validStatuses.includes(payment_status)) {
      return res.status(400).json({ error: "Invalid payment status" });
    }

    // Update payment info
    await pi.update({
      payment_status,
      amount_paid: amount_paid || 0,
    });

    res.json({ message: "Payment status updated successfully", pi });
  } catch (err) {
    console.error('updatePaymentStatus error:', err);
    res.status(500).json({ error: err.message });
  }
};
