const {
  LeatherStock,
  ProformaInvoice,
  PIItem,
  CollectionPrice,
  LeatherHideStock,
  Customer,
  TransportType,
  Transport,
  LeatherProduct,
  CollectionSeries,
  SubCollection,
  MainCollection,
  Batch,
  sequelize,
} = require("../../models");
const { Op, Transaction } = require("sequelize");
const { COMPANY, COMPANY_LIST } = require("../constants/company.constants");
const generateExactPIPdf = require('../utils/piPdf');

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
  if (hideList.length === 0) return [];

  // Normalize hides: ensure numeric qty and stable order (largest first helps greedy fallback)
  const normalized = hideList
    .map((h) => ({ hide_id: h.hide_id, qty: Number(h.qty) }))
    .filter((h) => h.qty > 0)
    .sort((a, b) => b.qty - a.qty);

  const combinations = [];
  const n = normalized.length;

  // Safety: exhaustive search only for reasonably small n (<=20)
  const MAX_EXHAUSTIVE = 20;

  if (n <= MAX_EXHAUSTIVE) {
    for (let mask = 1; mask < 1 << n; mask++) {
      let total = 0;
      const selectedHides = [];

      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          selectedHides.push(normalized[i]);
          total += normalized[i].qty;
        }
      }

      const difference = total - requested_qty;
      const absDistance = Math.abs(difference);

      combinations.push({
        allocated_qty: Number(total.toFixed(2)),
        difference: Number(difference.toFixed(2)),
        distance: absDistance,
        hides: selectedHides.map((h) => ({
          hide_id: h.hide_id,
          hide_qty: Number(h.qty.toFixed(2)),
        })),
        withinTolerance: absDistance <= tolerance,
      });
    }
  } else {
    // Greedy fallback for large hide sets: try prefix sums and some top-k combinations
    let running = 0;
    const sel = [];
    for (const h of normalized) {
      if (running >= requested_qty) break;
      sel.push(h);
      running += h.qty;
    }
    combinations.push({
      allocated_qty: Number(running.toFixed(2)),
      difference: Number((running - requested_qty).toFixed(2)),
      distance: Math.abs(Number((running - requested_qty).toFixed(2))),
      hides: sel.map((h) => ({
        hide_id: h.hide_id,
        hide_qty: Number(h.qty.toFixed(2)),
      })),
      withinTolerance: Math.abs(running - requested_qty) <= tolerance,
    });

    // try single largest + neighbours
    for (let i = 0; i < Math.min(10, n); i++) {
      let total = normalized[i].qty;
      const selected = [normalized[i]];
      for (let j = i + 1; j < Math.min(i + 6, n); j++) {
        if (total >= requested_qty) break;
        total += normalized[j].qty;
        selected.push(normalized[j]);
      }
      combinations.push({
        allocated_qty: Number(total.toFixed(2)),
        difference: Number((total - requested_qty).toFixed(2)),
        distance: Math.abs(Number((total - requested_qty).toFixed(2))),
        hides: selected.map((h) => ({
          hide_id: h.hide_id,
          hide_qty: Number(h.qty.toFixed(2)),
        })),
        withinTolerance: Math.abs(total - requested_qty) <= tolerance,
      });
    }
  }

  // Sort by closest match first (distance). For equal distance prefer larger allocated_qty (less shortfall)
  combinations.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return b.allocated_qty - a.allocated_qty;
  });

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
      transport_type_id,
      transport_id,
      weight_kg,
      transport_payment_status,
    } = req.body;

    console.log("CREATE PI REQUEST:", {
      customer_id,
      delivery_address,
      billing_address,
      shipping_address,
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

    // 🔐 RBAC: Set PI creator and location
    const pi = await ProformaInvoice.create(
      {
        customer_id,
        created_by: req.user.id,
        delivery_address,
        billing_address,
        shipping_address,
        transport_type_id,
        transport_id,
        weight_kg,
        transport_payment_status,
        transport_amount: transportAmount,
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

    if (req.user.role === "BUSINESS_EXECUTIVE") {
      // Business Executive: Only sees their own PIs
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
        "invoice_bill_number",
        "confirmed_at",
        "dispatched_at",
        "cancelled_at",
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
      console.log("FOrmatted json :",piJson.status)
      return {
        ...piJson,
        ...(piJson.customer || {}),
        status: piJson.status,
        customer: undefined,
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
      // Ensure batch_info is always an array
      let batchInfo = [];
      if (Array.isArray(item.batch_info)) batchInfo = item.batch_info;
      else if (typeof item.batch_info === "string") {
        try {
          batchInfo = JSON.parse(item.batch_info);
        } catch {
          batchInfo = [];
        }
      }

      // Create batch summary
      const batch_summary = batchInfo.reduce((acc, b) => {
        if (!acc[b.batch_no])
          acc[b.batch_no] = { batch_no: b.batch_no, qty: 0 };
        acc[b.batch_no].qty += b.qty;
        return acc;
      }, {});

      return {
        ...item.toJSON(),
        batch_info: batchInfo,
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
      stock.available_qty += item.qty;
      stock.reserved_qty -= item.qty;
      if (stock.reserved_qty < 0) stock.reserved_qty = 0;
      await stock.save({ transaction: t });
    }

    for (const item of pi.items) {
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
        const hideStock = await LeatherHideStock.findOne({
          where: { hide_id: b.hide_id },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!hideStock) {
          console.warn(
            `HideStock not found while cancelling PI (hide_id=${b.hide_id}), skipping hide stock restoration`,
          );
          continue;
        }
        hideStock.qty += b.qty;
        hideStock.status = "AVAILABLE";
        await hideStock.save({ transaction: t });
      }
    }

    pi.status = "CANCELLED";
    console.log(`PI status changing to ${pi.status}`);
    pi.cancelled_at = new Date();
    await pi.save({ transaction: t });
    await t.commit();
    res.json({ message: "PI cancelled and stock fully restored" });
  } catch (err) {
    await t.rollback();
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
      const rate = rateMap[item.product_id];

      if (rate === undefined || rate === null) {
        throw new Error(`Rate not found for product ${item.product_id}`);
      }

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
        // For Vitton, use LeatherStock as a single roll
        const stock = await LeatherStock.findOne({
          where: { product_id: item.product_id },
          attributes: ['available_qty'],
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

        if (requestedQty !== stock.available_qty) {
          suggestions.push({
            product_id: item.product_id,
            requested_qty: requestedQty,
            allocated_qty: 0,
            difference: -requestedQty,
            difference_abs: Math.abs(requestedQty),
            hides: [],
            rate,
            unit: "mtr",
            reason: `Vitton roll must be taken as a full roll. Available roll size is ${stock.available_qty} mtr, requested ${requestedQty} mtr.`,
          });
          continue;
        }

        // Exact match
        suggestions.push({
          product_id: item.product_id,
          leather_code: item.leather_code,
          requested_qty: requestedQty,
          allocated_qty: requestedQty,
          difference: 0,
          difference_abs: 0,
          within_tolerance: true,
          hides: [{ hide_id: "roll", hide_qty: requestedQty }],
          rate,
          unit: "mtr",
          line_amount: Number((requestedQty * rate).toFixed(2)),
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

      if (hideStocks.length === 0) {
        suggestions.push({
          product_id: item.product_id,
          requested_qty: requestedQty,
          allocated_qty: 0,
          difference: -requestedQty,
          difference_abs: Math.abs(requestedQty),
          hides: [],
          rate,
          reason: "No available hides",
        });
        continue;
      }

      // Use optimal combination algorithm
      const optimalCombinations = findOptimalHidesCombinations(
        hideStocks.map((s) => ({ hide_id: s.hide_id, qty: s.qty })),
        requestedQty,
        1, // tolerance: 1 sqft
      );

      if (!optimalCombinations || optimalCombinations.length === 0) {
        suggestions.push({
          product_id: item.product_id,
          requested_qty: requestedQty,
          allocated_qty: 0,
          difference: -requestedQty,
          difference_abs: Math.abs(requestedQty),
          hides: [],
          rate,
          unit: "sqft",
          reason: "Cannot find optimal hide combination",
        });
        continue;
      }

      const bestMatch = optimalCombinations[0];
      const difference = bestMatch.allocated_qty - requestedQty;

      suggestions.push({
        product_id: item.product_id,
        leather_code: item.leather_code,
        requested_qty: requestedQty,
        allocated_qty: bestMatch.allocated_qty,
        difference: Number(difference.toFixed(2)),
        difference_abs: Math.abs(bestMatch.allocated_qty - requestedQty),
        within_tolerance: bestMatch.withinTolerance,
        hides: bestMatch.hides.map((h) => ({
          hide_id: h.hide_id,
          hide_qty: h.hide_qty,
        })),
        rate,
        unit: "sqft",
        line_amount: Number((bestMatch.allocated_qty * rate).toFixed(2)),
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
    const { items, billing_address, shipping_address, delivery_address } = req.body;

    console.log("REVISIT PI REQUEST:", {
      id,
      billing_address,
      shipping_address,
      delivery_address,
      hasItems: Array.isArray(items)
    });

    if (!Array.isArray(items) || items.length === 0)
      throw new Error("No items provided for revisit");

    const pi = await ProformaInvoice.findByPk(id, {
      include: [{ model: PIItem, as: "items" }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pi) throw new Error("PI not found");
    if (!["ACTIVE", "PENDING_APPROVAL", "CONFIRMED"].includes(pi.status))
      throw new Error(
        "PI can only be revisited if status is ACTIVE, PENDING_APPROVAL, or CONFIRMED",
      );
    if (req.user.role === "BUSINESS_EXECUTIVE" && pi.created_by !== req.user.id)
      throw new Error("Unauthorized: You can only revise your own PIs");

    const rateMap = {};
    pi.items.forEach((i) => {
      rateMap[i.product_id] = i.rate;
    });

    const productIds = pi.items.map((i) => i.product_id);
    const stocks = await LeatherStock.findAll({
      where: { product_id: { [Op.in]: productIds } },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const stockMap = {};
    stocks.forEach((s) => {
      stockMap[s.product_id] = s;
    });

    for (const oldItem of pi.items) {
      const stock = stockMap[oldItem.product_id];
      if (stock) {
        stock.available_qty += oldItem.qty;
        stock.reserved_qty -= oldItem.qty;
        if (stock.reserved_qty < 0) stock.reserved_qty = 0;
        await stock.save({ transaction: t });
      }

      let batches = [];
      if (Array.isArray(oldItem.batch_info)) batches = oldItem.batch_info;
      else if (typeof oldItem.batch_info === "string") {
        try {
          batches = JSON.parse(oldItem.batch_info);
        } catch {
          batches = [];
        }
      }
      batches = batches.filter((b) => b && b.hide_id);

      for (const b of batches) {
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

    await PIItem.destroy({ where: { pi_id: pi.id }, transaction: t });

    for (const item of items) {
      if (!item.product_id || !item.qty || item.qty <= 0)
        throw new Error("Invalid item payload");

      // Use manual rate if provided, otherwise use existing rate
      const rate = item.rate !== undefined ? Number(item.rate) : rateMap[item.product_id];
      if (rate === undefined || rate === null || isNaN(rate))
        throw new Error(
          `Rate not found for product ${item.product_id}. Cannot revisit PI`,
        );

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

      const leatherStock = await LeatherStock.findOne({
        where: { product_id: item.product_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!leatherStock)
        throw new Error(
          `LeatherStock not found for product ${item.product_id}`,
        );

      if (isVitton) {
        // For Vitton, check exact roll match
        if (leatherStock.available_qty !== item.qty) {
          throw new Error(
            `For Vitton collection, available roll size is ${leatherStock.available_qty} sqm, requested ${item.qty} sqm. Cannot allocate partial roll.`,
          );
        }

        // Allocate the whole roll
        leatherStock.available_qty -= item.qty;
        leatherStock.reserved_qty += item.qty;
        await leatherStock.save({ transaction: t });

        await PIItem.create(
          {
            pi_id: pi.id,
            product_id: item.product_id,
            qty: item.qty,
            rate,
            batch_info: [{ hide_id: "roll", batch_no: "ROLL", qty: item.qty }],
          },
          { transaction: t },
        );
        continue;
      }

      // Non-Vitton logic
      if (leatherStock.available_qty < item.qty)
        throw new Error(
          `Insufficient available stock for product ${item.product_id}`,
        );

      const hideStocks = await LeatherHideStock.findAll({
        where: { product_id: item.product_id, status: "AVAILABLE" },
        attributes: ["id", "hide_id", "qty", "batch_no"],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (hideStocks.length === 0)
        throw new Error(`No available hides for product ${item.product_id}`);

      const optimalCombination = findOptimalHidesCombinations(
        hideStocks.map((s) => ({ hide_id: s.hide_id, qty: s.qty })),
        item.qty,
        1,
      );
      if (!optimalCombination || optimalCombination.length === 0)
        throw new Error(
          `Cannot find hide combination for ${item.qty} sqft for product ${item.product_id}`,
        );

      const bestMatch = optimalCombination[0];
      const usedBatches = [];

      for (const hide of bestMatch.hides) {
        const stock = hideStocks.find((s) => s.hide_id === hide.hide_id);
        if (!stock) throw new Error(`Hide ${hide.hide_id} not found`);
        stock.qty -= hide.hide_qty;
        stock.status = stock.qty <= 0 ? "RESERVED" : "AVAILABLE";
        await stock.save({ transaction: t });
        usedBatches.push({
          hide_id: stock.hide_id,
          batch_no: stock.batch_no,
          qty: hide.hide_qty,
        });
      }

      leatherStock.available_qty -= bestMatch.allocated_qty;
      leatherStock.reserved_qty += bestMatch.allocated_qty;
      await leatherStock.save({ transaction: t });

      await PIItem.create(
        {
          pi_id: pi.id,
          product_id: item.product_id,
          qty: bestMatch.allocated_qty,
          rate,
          batch_info: usedBatches,
        },
        { transaction: t },
      );
    }

    // Update address fields if provided
    if (billing_address !== undefined) pi.billing_address = billing_address;
    if (shipping_address !== undefined) pi.shipping_address = shipping_address;
    if (delivery_address !== undefined) pi.delivery_address = delivery_address;

    // Set status back to PENDING_APPROVAL so admin needs to approve the changes
    pi.status = "PENDING_APPROVAL";
    pi.updatedAt = new Date();
    await pi.save({ transaction: t });
    await t.commit();
    res.json({ message: "PI revisited successfully. Please wait for admin approval." });
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
    const { items, collection_id } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      throw new Error("No items provided");

    // Check if it's Vitton collection
    let isVittonColl = false;
    if (collection_id) {
      const mainColl = await MainCollection.findByPk(collection_id, { attributes: ['name'] });
      isVittonColl = mainColl?.name?.toLowerCase().includes('vitton');
      console.log('collection_id:', collection_id, 'mainColl.name:', mainColl?.name, 'isVittonColl:', isVittonColl);
    }

    // configurable tolerance in sqft (default 1 sqft)
    const TOLERANCE = 1;
    const response = [];

    /**
     * Find all possible hide combinations and rank by closest match to requested qty
     * Returns top suggestions within tolerance, or closest matches if outside tolerance
     */
    const findOptimalHidesCombinations = (hideList, requested_qty) => {
      if (hideList.length === 0) return [];

      // Normalize hides: ensure numeric qty and stable order (largest first helps greedy fallback)
      const normalized = hideList
        .map((h) => ({ hide_id: h.hide_id, qty: Number(h.qty) }))
        .filter((h) => h.qty > 0)
        .sort((a, b) => b.qty - a.qty);

      const combinations = [];
      const n = normalized.length;

      // Safety: exhaustive search only for reasonably small n (<=20)
      const MAX_EXHAUSTIVE = 20;

      if (n <= MAX_EXHAUSTIVE) {
        for (let mask = 1; mask < 1 << n; mask++) {
          let total = 0;
          const selectedHides = [];

          for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) {
              selectedHides.push(normalized[i]);
              total += normalized[i].qty;
            }
          }

          const difference = total - requested_qty;
          const absDistance = Math.abs(difference);

          combinations.push({
            allocated_qty: Number(total.toFixed(2)),
            difference: Number(difference.toFixed(2)),
            distance: absDistance,
            hides: selectedHides.map((h) => ({
              hide_id: h.hide_id,
              hide_qty: Number(h.qty.toFixed(2)),
            })),
            withinTolerance: absDistance <= TOLERANCE,
          });
        }
      } else {
        // Greedy fallback for large hide sets: try prefix sums and some top-k combinations
        let running = 0;
        const sel = [];
        for (const h of normalized) {
          if (running >= requested_qty) break;
          sel.push(h);
          running += h.qty;
        }
        combinations.push({
          allocated_qty: Number(running.toFixed(2)),
          difference: Number((running - requested_qty).toFixed(2)),
          distance: Math.abs(Number((running - requested_qty).toFixed(2))),
          hides: sel.map((h) => ({
            hide_id: h.hide_id,
            hide_qty: Number(h.qty.toFixed(2)),
          })),
          withinTolerance: Math.abs(running - requested_qty) <= TOLERANCE,
        });

        // try single largest + neighbours
        for (let i = 0; i < Math.min(10, n); i++) {
          let total = normalized[i].qty;
          const selected = [normalized[i]];
          for (let j = i + 1; j < Math.min(i + 6, n); j++) {
            if (total >= requested_qty) break;
            total += normalized[j].qty;
            selected.push(normalized[j]);
          }
          combinations.push({
            allocated_qty: Number(total.toFixed(2)),
            difference: Number((total - requested_qty).toFixed(2)),
            distance: Math.abs(Number((total - requested_qty).toFixed(2))),
            hides: selected.map((h) => ({
              hide_id: h.hide_id,
              hide_qty: Number(h.qty.toFixed(2)),
            })),
            withinTolerance: Math.abs(total - requested_qty) <= TOLERANCE,
          });
        }
      }

      // Sort by closest match first (distance). For equal distance prefer larger allocated_qty (less shortfall)
      combinations.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.allocated_qty - a.allocated_qty;
      });

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
    const { customer_id, items, price_type, company_name } = req.body;

    if (!customer_id) throw new Error("customer_id required");
    if (!price_type) throw new Error("price_type required");
    if (!Array.isArray(items) || items.length === 0)
      throw new Error("No items provided");
    const company = company_name || COMPANY.MARVIN;

    if (!COMPANY_LIST.includes(company)) {
      throw new Error("Invalid company_name");
    }

    // 1️⃣ Create PI
    // 🔐 RBAC: Set PI creator
    const pi = await ProformaInvoice.create(
      {
        customer_id,
        company_name: company,
        created_by: req.user.id,
        status: "PENDING_APPROVAL",
        expires_at: new Date(Date.now() + 7 * 86400000),
      },
      { transaction: t },
    );

    // 2️⃣ Process each item
    let allVitton = true;
    for (const item of items) {
      const { product_id, batch_no, hides, collection_series_id, requested_qty } = item;

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
          price_type,
          is_active: true,
        },
        transaction: t,
      });

      if (!price) throw new Error(`Price not found for ${price_type}`);

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

        if (allocatedQty !== piItem.qty) {
          throw new Error(`Allocated quantity (${allocatedQty}) does not match required quantity (${piItem.qty}) for item ${item_id}`);
        }

        // Update the PI item with new batch info
        await piItem.update({ batch_info: batchInfo }, { transaction: t });

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
        transport_amount: transport_amount || 0,
        perforation_qty: perforation_qty || 0,
        perforation_amount: perforation_amount || 0,
        perforation_payment_status,
        status: "ACTIVE",
        confirmed_at: new Date(),
      },
      { transaction: t },
    );

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
    const { product_id, search, page = 1, limit = 50 } = req.query;
    
    if (!product_id) {
      return res.status(400).json({ error: "product_id is required" });
    }

    const where = {
      product_id: Number(product_id),
      status: "AVAILABLE",
      qty: { [Op.gt]: 0 }
    };

    // Add search filter if provided
    if (search && search.trim()) {
      where.hide_id = { [Op.iLike]: `%${search.trim()}%` };
    }

    const offset = (Number(page) - 1) * Number(limit);

    const hides = await LeatherHideStock.findAll({
      where,
      attributes: ["id", "hide_id", "qty", "batch_no", "batch_id", "createdAt"],
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

    const total = await LeatherHideStock.count({ where });

    res.json({
      hides: hides.map(h => ({
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
      }
    });
  } catch (err) {
    console.error("listAvailableHidesForReallocation error:", err);
    res.status(500).json({ error: err.message });
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
    if (location && !["Bangalore", "Delhi", "Mumbai"].includes(location)) {
      throw new Error("Invalid location. Must be Bangalore, Delhi, or Mumbai");
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
    let updatedQty = item.qty;

    if (Array.isArray(batch_info)) {
      updatedBatchInfo = batch_info;
      const sumQty = batch_info.reduce((sum, b) => sum + Number(b.qty || 0), 0);
      if (!req.body.qty) {
        updatedQty = sumQty;
      }
    } else if (Array.isArray(hides)) {
      updatedBatchInfo = hides.map((h) => ({
        hide_id: h.hide_id,
        batch_no: h.batch_no,
        qty: Number(h.hide_qty),
        collection_series_id: h.collection_series_id || null,
      }));
      updatedQty = updatedBatchInfo.reduce((sum, b) => sum + Number(b.qty || 0), 0);
    } else {
      throw new Error("batch_info or hides array is required");
    }

    if (req.body.qty !== undefined) {
      updatedQty = Number(req.body.qty);
    }

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
          await hideStock.save({ transaction: t });
          console.log(`    ✓ Released! Status: RESERVED → AVAILABLE`);
        } else {
          console.log(`    ⚠ Status is "${hideStock.status}", not RESERVED`);
        }
      } else {
        console.log(`    ✗ Hide not found in leather_hide_stocks!`);
      }
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

    res.json(pis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
