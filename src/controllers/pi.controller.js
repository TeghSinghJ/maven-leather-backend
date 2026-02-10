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
  sequelize,
} = require("../../models");
const { Op ,Transaction} = require("sequelize");
const generateExactPIPdf = require("../utils/piPdf");

/**
 * Utility: Find optimal hide combinations for a requested quantity
 * Returns combinations sorted by closeness to requested quantity
 */
const findOptimalHidesCombinations = (hideList, requested_qty, tolerance = 1) => {
  if (hideList.length === 0) return [];

  // Normalize hides: ensure numeric qty and stable order (largest first helps greedy fallback)
  const normalized = hideList
    .map(h => ({ hide_id: h.hide_id, qty: Number(h.qty) }))
    .filter(h => h.qty > 0)
    .sort((a, b) => b.qty - a.qty);

  const combinations = [];
  const n = normalized.length;

  // Safety: exhaustive search only for reasonably small n (<=20)
  const MAX_EXHAUSTIVE = 20;

  if (n <= MAX_EXHAUSTIVE) {
    for (let mask = 1; mask < (1 << n); mask++) {
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
        hides: selectedHides.map(h => ({ hide_id: h.hide_id, hide_qty: Number(h.qty.toFixed(2)) })),
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
      hides: sel.map(h => ({ hide_id: h.hide_id, hide_qty: Number(h.qty.toFixed(2)) })),
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
        hides: selected.map(h => ({ hide_id: h.hide_id, hide_qty: Number(h.qty.toFixed(2)) })),
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
  const withinTolerance = combinations.filter(c => c.withinTolerance);
  const outsideTolerance = combinations.filter(c => !c.withinTolerance);

  return [
    ...withinTolerance.slice(0, 5),
    ...outsideTolerance.slice(0, Math.max(0, 5 - withinTolerance.length)),
  ];
};
exports.createPI = async (req, res) => {
  const t = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED });

  try {
    const {
      customer_id,
      items,
      price_type,
      delivery_address,
      transport_type_id,
      transport_id,
      weight_kg,
      transport_payment_status,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No items provided for PI');
    }

    let transportAmount = 0;
    if (transport_type_id && weight_kg) {
      const transportType = await TransportType.findByPk(transport_type_id, { transaction: t });
      if (!transportType) throw new Error('Invalid transport type');
      transportAmount = weight_kg * Number(transportType.base_price);
    }
    const finalTransportAmount = transport_payment_status === 'PAID' ? 0 : transportAmount;

    // 🔐 RBAC: Set PI creator and location
    const pi = await ProformaInvoice.create(
      {
        customer_id,
        created_by: req.user.id,
        delivery_address,
        transport_type_id,
        transport_id,
        weight_kg,
        transport_payment_status,
        transport_amount: finalTransportAmount,
        status: 'ACTIVE',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      { transaction: t }
    );

    for (const item of items) {
      const { product_id, qty, batch_no, hides } = item;

      if (!product_id || !qty || !Array.isArray(hides) || hides.length === 0) {
        throw new Error('Invalid item payload: product_id, qty, and hides are required');
      }

      let allocatedQty = 0;
      const batchInfo = [];

      for (const h of hides) {
        const { hide_id, hide_qty } = h;

        const hideStock = await LeatherHideStock.findOne({
          where: { hide_id, status: 'AVAILABLE', batch_no },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!hideStock) throw new Error(`Hide ${hide_id} in batch ${batch_no} not available`);
        if (hideStock.qty < hide_qty) throw new Error(`Hide ${hide_id} in batch ${batch_no} has insufficient quantity`);

        hideStock.qty -= hide_qty;
        hideStock.status = hideStock.qty === 0 ? 'RESERVED' : 'AVAILABLE';
        await hideStock.save({ transaction: t });

        batchInfo.push({ hide_id, batch_no, qty: hide_qty, collection_series_id: hideStock.collection_series_id });
        allocatedQty += hide_qty;
      }

      if (allocatedQty !== qty) throw new Error(`Allocated quantity (${allocatedQty}) does not match requested quantity (${qty}) for product ${product_id}`);

      const leatherStock = await LeatherStock.findOne({
        where: { product_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!leatherStock || leatherStock.available_qty < qty) throw new Error(`Insufficient overall stock for product ${product_id}`);

      leatherStock.available_qty -= qty;
      leatherStock.reserved_qty += qty;
      await leatherStock.save({ transaction: t });

      const priceObj = await CollectionPrice.findOne({
        where: { collection_series_id: batchInfo[0].collection_series_id, price_type },
        transaction: t,
      });
      if (!priceObj) throw new Error('Price not defined for product');

      await PIItem.create(
        {
          pi_id: pi.id,
          product_id,
          qty,
          rate: priceObj.price,
          batch_info: batchInfo,
        },
        { transaction: t }
      );
    }

    await t.commit();
    res.status(201).json({ message: 'PI created successfully', pi_id: pi.id });
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
    console.log('getPIs: user=', req.user && { id: req.user.id, role: req.user.role }, 'where=', where);
    // Admin: No where clause needed - sees all PIs
    
    const pis = await ProformaInvoice.findAll({
      where,
      attributes: [
        "id",
        "customer_id",
        "created_by",
        "status",
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
              attributes: ["id", "leather_code", "color", "hsn_code", "image_url"],
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

    const formattedResponse = pis.map((pi) => {
      const piJson = pi.toJSON();

      return {
        ...piJson,
        ...(piJson.customer || {}), 
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
              attributes: ["id", "leather_code", "color", "hsn_code", "image_url"],
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

    if (!pi) return res.status(404).json({ error: "Proforma Invoice not found" });

    // RBAC check
    if (req.user.role === "BUSINESS_EXECUTIVE" && pi.created_by !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized: You can only view your own PIs" });
    }

    const items = pi.items.map(item => {
      // Ensure batch_info is always an array
      let batchInfo = [];
      if (Array.isArray(item.batch_info)) batchInfo = item.batch_info;
      else if (typeof item.batch_info === "string") {
        try { batchInfo = JSON.parse(item.batch_info); } 
        catch { batchInfo = []; }
      }

      // Create batch summary
      const batch_summary = batchInfo.reduce((acc, b) => {
        if (!acc[b.batch_no]) acc[b.batch_no] = { batch_no: b.batch_no, qty: 0 };
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
      include: [{
        model: PIItem,
        as: "items",
        attributes: ["id", "product_id", "qty", "batch_info"],
      }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pi) throw new Error("PI not found");
    
    // 🔐 RBAC: Business Executive can only cancel their own PIs; Admin can cancel any
    if (req.user.role === "BUSINESS_EXECUTIVE" && pi.created_by !== req.user.id) {
      throw new Error("Unauthorized: You can only cancel your own PIs");
    }
    
    console.log(`Cancelling PI ${pi.id} with status: ${pi.status}`);
    if (pi.status !== "ACTIVE" && pi.status !== "PENDING_APPROVAL" && pi.status !== "CONFIRMED")
      throw new Error(`PI can only be cancelled if it is PENDING_APPROVAL, ACTIVE, or CONFIRMED. Current status: ${pi.status}`);

    const productIds = pi.items.map(i => i.product_id);

    const stocks = await LeatherStock.findAll({
      where: { product_id: { [Op.in]: productIds } },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const stockMap = {};
    stocks.forEach(s => (stockMap[s.product_id] = s));

    for (const item of pi.items) {
      const stock = stockMap[item.product_id];
      if (!stock) continue;

      stock.available_qty += item.qty;
      stock.reserved_qty -= item.qty;
      if (stock.reserved_qty < 0) stock.reserved_qty = 0;

      await stock.save({ transaction: t });
    }

    for (const item of pi.items) {
      const batches = item.batch_info || [];

      for (const b of batches) {
        const hideStock = await LeatherHideStock.findOne({
          where: { hide_id: b.hide_id }, 
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!hideStock) {
          throw new Error(
            `HideStock not found while cancelling PI (hide_id=${b.hide_id})`
          );
        }

        hideStock.qty += b.qty;
        hideStock.status = "AVAILABLE";

        await hideStock.save({ transaction: t });
      }
    }

    pi.status = "CANCELLED";
    await pi.save({ transaction: t });

    await t.commit();
    res.json({ message: "PI cancelled and stock fully restored" });

  } catch (err) {
    await t.rollback();
    console.error("Cancel PI Error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.downloadPI = async (req, res) => {
  try {
    const pi = await ProformaInvoice.findByPk(req.params.id, {
      attributes: [
        "id",
        "customer_id",
        "status",
        "createdAt",
        "transport_amount",
        "transport_payment_status",
        "delivery_address",
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

    // Flatten customer details to top level for PDF compatibility
    const piData = pi.toJSON();
    if (piData.customer) {
      piData.customer_name = piData.customer.customer_name || "";
      piData.address = piData.customer.address || "";
      piData.gst_number = piData.customer.gst_number || "-";
      piData.state = piData.customer.state || "";
      piData.pin_code = piData.customer.pin_code || "";
      piData.contact = piData.customer.contact_number || "-";
    } else {
      // Fallback if customer is not loaded
      piData.customer_name = piData.customer_name || "";
      piData.address = piData.address || "";
      piData.gst_number = piData.gst_number || "-";
      piData.state = piData.state || "";
      piData.pin_code = piData.pin_code || "";
      piData.contact = piData.contact || "-";
    }

    console.log("PI Data for PDF:", {
      pi_id: piData.id,
      customer_name: piData.customer_name,
      state: piData.state,
      pin_code: piData.pin_code,
      transport_amount: piData.transport_amount,
      transport_payment_status: piData.transport_payment_status,
      items_count: piData.items?.length,
    });

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
      throw new Error("PI can only be revisited if status is ACTIVE, PENDING_APPROVAL, or CONFIRMED");
    }

    // 🔐 RBAC: Business Executive can only request suggestions for their own PIs
    if (req.user.role === "BUSINESS_EXECUTIVE" && pi.created_by !== req.user.id) {
      throw new Error("Unauthorized: You can only suggest revisions for your own PIs");
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

      // Fetch available hides for this product (do not lock, just read)
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
        hideStocks.map(s => ({ hide_id: s.hide_id, qty: s.qty })),
        requestedQty,
        1 // tolerance: 1 sqft
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
        hides: bestMatch.hides.map(h => ({
          hide_id: h.hide_id,
          hide_qty: h.hide_qty,
        })),
        rate,
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
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No items provided for revisit");
    }

    /**
     * STEP 1: Fetch & lock PI
     */
    const pi = await ProformaInvoice.findByPk(id, {
      include: [{ model: PIItem, as: "items" }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pi) throw new Error("PI not found");
    if (!["ACTIVE", "PENDING_APPROVAL", "CONFIRMED"].includes(pi.status)) {
      throw new Error("PI can only be revisited if status is ACTIVE, PENDING_APPROVAL, or CONFIRMED");
    }

    // 🔐 RBAC: Business Executive can only perform revisit on their own PIs
    if (req.user.role === "BUSINESS_EXECUTIVE" && pi.created_by !== req.user.id) {
      throw new Error("Unauthorized: You can only revise your own PIs");
    }

    /**
     * STEP 2: Cache old rates (CRITICAL)
     */
    const rateMap = {};
    pi.items.forEach((i) => {
      rateMap[i.product_id] = i.rate;
    });

    /**
     * STEP 3: Release old reserved aggregate stock
     */
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

      if (!stock) continue;

      stock.available_qty += oldItem.qty;
      stock.reserved_qty -= oldItem.qty;

      if (stock.reserved_qty < 0) stock.reserved_qty = 0;

      await stock.save({ transaction: t });
    }

    /**
     * STEP 4: Restore batch stock
     */
    for (const oldItem of pi.items) {
      const batches = oldItem.batch_info || [];

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

    /**
     * STEP 5: Delete old PI items
     */
    await PIItem.destroy({
      where: { pi_id: pi.id },
      transaction: t,
    });

    /**
     * STEP 6: Re-reserve stock & recreate PI items
     */
    for (const item of items) {
      if (!item.product_id || !item.qty || item.qty <= 0) {
        throw new Error("Invalid item payload");
      }

      const rate = rateMap[item.product_id];
      if (rate === undefined || rate === null) {
        throw new Error(
          `Rate not found for product ${item.product_id}. Cannot revisit PI`
        );
      }

      /**
       * 6.1 Lock LeatherStock
       */
      const leatherStock = await LeatherStock.findOne({
        where: { product_id: item.product_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!leatherStock) {
        throw new Error(
          `LeatherStock not found for product ${item.product_id}`
        );
      }

      if (leatherStock.available_qty < item.qty) {
        throw new Error(
          `Insufficient available stock for product ${item.product_id}`
        );
      }

      /**
       * 6.2 Use optimal hide combination algorithm instead of FIFO
       */
      const hideStocks = await LeatherHideStock.findAll({
        where: {
          product_id: item.product_id,
          status: "AVAILABLE",
        },
        attributes: ["id", "hide_id", "qty", "batch_no"],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (hideStocks.length === 0) {
        throw new Error(
          `No available hides for product ${item.product_id}`
        );
      }

      // Use optimal combination algorithm (tolerance 1 sqft)
      const optimalCombination = findOptimalHidesCombinations(
        hideStocks.map(s => ({ hide_id: s.hide_id, qty: s.qty })),
        item.qty,
        1 // tolerance: 1 sqft
      );

      if (!optimalCombination || optimalCombination.length === 0) {
        throw new Error(
          `Cannot find hide combination for ${item.qty} sqft for product ${item.product_id}`
        );
      }

      // Select best match
      const bestMatch = optimalCombination[0];
      const usedHideIds = bestMatch.hides.map(h => h.hide_id);
      const usedBatches = [];

      // Reserve selected hides
      for (const hide of bestMatch.hides) {
        const stock = hideStocks.find(s => s.hide_id === hide.hide_id);
        if (!stock) {
          throw new Error(`Hide ${hide.hide_id} not found`);
        }

        const consumeQty = hide.hide_qty;
        stock.qty -= consumeQty;
        stock.status = stock.qty <= 0 ? "RESERVED" : "AVAILABLE";
        await stock.save({ transaction: t });

        usedBatches.push({
          hide_id: stock.hide_id,
          batch_no: stock.batch_no,
          qty: consumeQty,
        });
      }

      /**
       * 6.3 Update aggregate stock
       */
      leatherStock.available_qty -= bestMatch.allocated_qty;
      leatherStock.reserved_qty += bestMatch.allocated_qty;
      await leatherStock.save({ transaction: t });

      /**
       * 6.4 Recreate PI item (RATE PRESERVED, OPTIMAL HIDES SELECTED)
       */
      await PIItem.create(
        {
          pi_id: pi.id,
          product_id: item.product_id,
          qty: bestMatch.allocated_qty,
          rate,
          batch_info: usedBatches,
        },
        { transaction: t }
      );
    }

    /**
     * STEP 7: Update PI timestamp
     */
    pi.updatedAt = new Date();
    await pi.save({ transaction: t });

    await t.commit();

    res.json({ message: "PI revisited successfully" });
  } catch (err) {
    await t.rollback();
    console.error("Revisit PI Error:", err);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Suggest batches for requested product quantity (HIDE-LEVEL)
 * Uses optimal hide combination selection algorithm
 */
exports.suggestBatch = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { items, tolerance } = req.body;
    if (!Array.isArray(items) || items.length === 0) throw new Error("No items provided");

    // configurable tolerance in sqft (default 1 sqft)
    const TOLERANCE = typeof tolerance === 'number' && !isNaN(tolerance) ? Math.abs(tolerance) : (tolerance ? Math.abs(Number(tolerance)) : 1);
    const response = [];

    /**
     * Find all possible hide combinations and rank by closest match to requested qty
     * Returns top suggestions within tolerance, or closest matches if outside tolerance
     */
    const findOptimalHidesCombinations = (hideList, requested_qty) => {
      if (hideList.length === 0) return [];

      // Normalize hides: ensure numeric qty and stable order (largest first helps greedy fallback)
      const normalized = hideList
        .map(h => ({ hide_id: h.hide_id, qty: Number(h.qty) }))
        .filter(h => h.qty > 0)
        .sort((a, b) => b.qty - a.qty);

      const combinations = [];
      const n = normalized.length;

      // Safety: exhaustive search only for reasonably small n (<=20)
      const MAX_EXHAUSTIVE = 20;

      if (n <= MAX_EXHAUSTIVE) {
        for (let mask = 1; mask < (1 << n); mask++) {
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
            hides: selectedHides.map(h => ({ hide_id: h.hide_id, hide_qty: Number(h.qty.toFixed(2)) })),
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
          hides: sel.map(h => ({ hide_id: h.hide_id, hide_qty: Number(h.qty.toFixed(2)) })),
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
            hides: selected.map(h => ({ hide_id: h.hide_id, hide_qty: Number(h.qty.toFixed(2)) })),
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
      const withinTolerance = combinations.filter(c => c.withinTolerance);
      const outsideTolerance = combinations.filter(c => !c.withinTolerance);

      return [
        ...withinTolerance.slice(0, 5),
        ...outsideTolerance.slice(0, Math.max(0, 5 - withinTolerance.length)),
      ];
    };

    // Use module-level findOptimalHidesCombinations with tolerance
    for (const { product_id, requested_qty } of items) {
      if (!product_id || requested_qty == null)
        throw new Error("product_id and requested_qty are required");

      const hides = await LeatherHideStock.findAll({
        where: { product_id, status: "AVAILABLE" },
        attributes: ["batch_no", "qty", "hide_id"],
        transaction: t,
        lock: t.LOCK.SHARE,
        raw: true,
      });

      if (!hides.length) {
        response.push({
          product_id,
          requested_qty,
          exactMatch: false,
          suggestions: [],
          reason: "No available hides",
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
        const suggestions = findOptimalHidesCombinations(hideList, requested_qty, TOLERANCE);

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
            bestSuggestion: suggestions[0]
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
          suggestions: exactMatches.map(b => ({
            batch_no: b.batch_no,
            ...b.bestSuggestion
          })),
        });
        continue;
      }

      // Get all suggestions from all batches, ranked by best match
      const allSuggestions = [];
      for (const batch of batchResults) {
        if (batch.suggestions) {
          batch.suggestions.forEach(s => {
            allSuggestions.push({
              batch_no: batch.batch_no,
              ...s
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
        reason: "Multiple combinations available, ranked by closeness to requested quantity"
      });
    }

    await t.commit();
    res.json(response);
  } catch (err) {
    await t.rollback();
    console.error("suggestBatch error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.createPIConfirmed = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { customer_id, items, price_type } = req.body;

    if (!customer_id) throw new Error("customer_id required");
    if (!price_type) throw new Error("price_type required");
    if (!Array.isArray(items) || items.length === 0) throw new Error("No items provided");

    // 1️⃣ Create PI
    // 🔐 RBAC: Set PI creator
    const pi = await ProformaInvoice.create(
      {
        customer_id,
        created_by: req.user.id,
        status: "PENDING_APPROVAL",
        expires_at: new Date(Date.now() + 7 * 86400000),
      },
      { transaction: t }
    );

    // 2️⃣ Process each item
    for (const item of items) {
      const { product_id, batch_no, hides, collection_series_id } = item;

      if (!Array.isArray(hides) || hides.length === 0) {
        throw new Error(`No hides selected for product ${product_id} batch ${batch_no}`);
      }

      // 🔒 Lock selected hides
      const hideIds = hides.map((h) => h.hide_id);
      const hideRecords = await LeatherHideStock.findAll({
        where: { hide_id: hideIds, status: "AVAILABLE" },
        transaction: t,
        lock: t.LOCK.UPDATE,
        order: [["id", "ASC"]],
      });

      if (hideRecords.length !== hides.length) {
        throw new Error(`Some hides are no longer available for batch ${batch_no}`);
      }

      // 3️⃣ Reserve hides
      let allocatedQty = 0;
      const batchInfo = [];

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
        { transaction: t }
      );
    }

    await t.commit();
    res.status(201).json({
      message: "PI created & sent for approval",
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
      transport_payment_status,
      delivery_address,
      receiver_courier_name,
    } = req.body;

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

    // 🔹 Determine transport amount
    // Accept `transport_amount` from client (manual mode). If not provided, calculate automatically:
    // - Prefer transport type's `base_price` (Rs per kg) if available and `weight_kg` provided
    // - Fallback to default conversion 1 hide = 4.45 kg and PRICE_PER_KG = 30
    let transportAmount = 0;
    const KG_PER_HIDE = 4.45; // kg per hide (fallback)
    const PRICE_PER_KG = 30; // Rs per kg (fallback)

    if (req.body.transport_amount != null && req.body.transport_amount !== "") {
      transportAmount = Number(req.body.transport_amount) || 0;
      console.log(`Using manual transport_amount from request: ${transportAmount}`);
    } else if (transport_type_id && weight_kg) {
      // Try to use transport type's base price
      const transportType = await TransportType.findByPk(transport_type_id, { transaction: t });
      if (transportType && transportType.base_price) {
        transportAmount = Number(weight_kg) * Number(transportType.base_price);
        console.log(`Auto transport: weight_kg ${weight_kg} × transportType.base_price ${transportType.base_price} = ${transportAmount}`);
      } else {
        // Fallback: if weight_kg provided use default PRICE_PER_KG, else compute from hides
        if (weight_kg) {
          transportAmount = Number(weight_kg) * PRICE_PER_KG;
          console.log(`Auto transport fallback using weight_kg ${weight_kg} × ${PRICE_PER_KG} = ${transportAmount}`);
        } else {
          // Count total hides and convert to kg
          let totalHides = 0;
          for (const item of pi.items) {
            let batchInfo = item.batch_info || [];
            if (typeof batchInfo === 'string') {
              try { batchInfo = JSON.parse(batchInfo); } catch (e) { batchInfo = []; }
            }
            if (Array.isArray(batchInfo)) totalHides += batchInfo.length;
          }
          transportAmount = totalHides * KG_PER_HIDE * PRICE_PER_KG;
          console.log(`Auto transport fallback from hides: ${totalHides} hides × ${KG_PER_HIDE} kg/hide × ${PRICE_PER_KG} Rs/kg = ${transportAmount}`);
        }
      }
    }

    // 🔹 Update PI - Always save transport_amount, regardless of payment status
    await pi.update(
      {
        transport_type_id,
        transport_id,
        weight_kg,
        transport_payment_status,
        delivery_address,
        receiver_courier_name,
        transport_amount: transportAmount,
        status: "CONFIRMED",
      },
      { transaction: t }
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
              attributes: ["id", "leather_code", "color", "hsn_code", "image_url"],
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
