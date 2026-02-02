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
exports.createPI = async (req, res) => {
  const t = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED });

  try {
    const {
      customer_id,
      items, // now each item must include: product_id, qty, hide_id
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

    // Calculate transport amount
    let transportAmount = 0;
    if (transport_type_id && weight_kg) {
      const transportType = await TransportType.findByPk(transport_type_id, { transaction: t });
      if (!transportType) throw new Error('Invalid transport type');
      transportAmount = weight_kg * Number(transportType.base_price);
    }
    const finalTransportAmount = transport_payment_status === 'PAID' ? 0 : transportAmount;

    // Create PI
    const pi = await ProformaInvoice.create(
      {
        customer_id,
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

    // Allocate each item from the selected batch
    for (const item of items) {
      const { product_id, qty, hide_id } = item;
      if (!product_id || !qty || !hide_id) throw new Error('Invalid item payload');

      // Lock the selected batch
      const hideStock = await LeatherHideStock.findOne({
        where: { hide_id, status: 'AVAILABLE' },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!hideStock || hideStock.qty < qty) {
        throw new Error(`Selected batch does not have enough stock for product ${product_id}`);
      }

      // Lock aggregate stock
      const leatherStock = await LeatherStock.findOne({
        where: { product_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!leatherStock || leatherStock.available_qty < qty) throw new Error(`Insufficient stock for product ${product_id}`);

      // Deduct stock
      hideStock.qty -= qty;
      hideStock.status = hideStock.qty === 0 ? 'RESERVED' : 'AVAILABLE';
      await hideStock.save({ transaction: t });

      leatherStock.available_qty -= qty;
      leatherStock.reserved_qty += qty;
      await leatherStock.save({ transaction: t });

      // Create PIItem
      const priceObj = await CollectionPrice.findOne({
        where: { collection_series_id: hideStock.collection_series_id, price_type },
        transaction: t,
      });
      if (!priceObj) throw new Error('Price not defined for product');

      await PIItem.create(
        { pi_id: pi.id, product_id, qty, rate: priceObj.price, batch_info: [{ hide_id, batch_no: hideStock.batch_no, qty }] },
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
    const pis = await ProformaInvoice.findAll({
      include: [
        {
          model: PIItem,
          as: "items",
          include: [
            {
              model: LeatherProduct,
              as: "product",
              attributes: ["leather_code", "color", "image_url"],
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
              attributes: ["leather_code", "color", "image_url"],
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
        },
      ],
    });

    if (!pi) {
      return res.status(404).json({ error: "Proforma Invoice not found" });
    }

    // 🔹 Aggregate batch_info per batch_no for each item
    const itemsWithAggregatedBatches = pi.items.map((item) => {
      const batchMap = {};

      (item.batch_info || []).forEach((b) => {
        if (!batchMap[b.batch_no]) batchMap[b.batch_no] = 0;
        batchMap[b.batch_no] += b.qty;
      });

      const aggregatedBatchInfo = Object.entries(batchMap).map(
        ([batch_no, qty]) => ({ batch_no, qty })
      );

      return {
        ...item.toJSON(),
        batch_info: aggregatedBatchInfo,
      };
    });

    const piResponse = {
      ...pi.toJSON(),
      items: itemsWithAggregatedBatches,
    };

    res.json(piResponse);
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
    if (pi.status !== "ACTIVE")
      throw new Error("Only ACTIVE PI can be cancelled");

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
      include: [
        {
          model: PIItem,
          as: "items",
          include: [
            {
              model: LeatherProduct,
              as: "product",
              attributes: ["leather_code", "color"],
            },
          ],
        },
      ],
    });

    if (!pi) {
      return res.status(404).json({ error: "PI not found" });
    }

    return generateExactPIPdf(res, pi);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    if (pi.status !== "ACTIVE") {
      throw new Error("Only ACTIVE PI can be revisited");
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
       * 6.2 Consume batch stock (FIFO)
       */
      const hideStocks = await LeatherHideStock.findAll({
        where: {
          product_id: item.product_id,
          status: "AVAILABLE",
        },
        order: [["batch_no", "ASC"]],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      let qtyRemaining = item.qty;
      const usedBatches = [];

      for (const stock of hideStocks) {
        if (qtyRemaining <= 0) break;

        const consumeQty = Math.min(stock.qty, qtyRemaining);

        usedBatches.push({
          hide_id: stock.hide_id,
          batch_no: stock.batch_no,
          qty: consumeQty,
        });

        stock.qty -= consumeQty;
        stock.status = stock.qty === 0 ? "RESERVED" : "AVAILABLE";

        await stock.save({ transaction: t });

        qtyRemaining -= consumeQty;
      }

      if (qtyRemaining > 0) {
        throw new Error(
          `Insufficient batch stock for product ${item.product_id}`
        );
      }

      /**
       * 6.3 Update aggregate stock
       */
      leatherStock.available_qty -= item.qty;
      leatherStock.reserved_qty += item.qty;
      await leatherStock.save({ transaction: t });

      /**
       * 6.4 Recreate PI item (RATE PRESERVED)
       */
      await PIItem.create(
        {
          pi_id: pi.id,
          product_id: item.product_id,
          qty: item.qty,
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
 * Suggest batches for requested product quantity
 * - Checks first sufficient batch
 * - If not available, suggest nearby batches ±5 or ±10
 */
exports.suggestBatch = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No items provided");
    }

    const response = [];

    for (const { product_id, requested_qty } of items) {
      if (!product_id || !requested_qty) {
        throw new Error("product_id and requested_qty are required");
      }

      const hides = await LeatherHideStock.findAll({
        where: {
          product_id,
          status: "AVAILABLE",
        },
        attributes: ["batch_no", "qty"],
        transaction: t,
        lock: t.LOCK.SHARE,
      });

      if (!hides.length) {
        response.push({
          product_id,
          requested_qty,
          exactBatchAvailable: false,
          suggestions: [],
          reason: "No available batches",
        });
        continue;
      }

      const batchTotals = {};
      for (const h of hides) {
        batchTotals[h.batch_no] =
          (batchTotals[h.batch_no] || 0) + Number(h.qty);
      }

      const batches = Object.entries(batchTotals).map(
        ([batch_no, available_qty]) => ({
          batch_no,
          available_qty,
        })
      );

      const exactBatch = batches.find(b => b.available_qty === requested_qty);
      if (exactBatch) {
        response.push({
          product_id,
          requested_qty,
          exactBatchAvailable: true,
          suggested_batch: exactBatch,
          suggestions: [],
        });
        continue;
      }

      const deltas = Array.from({ length: 10 }, (_, i) => i + 1); // [1,2,...,10]
      const suggestions = batches.filter(b =>
        deltas.some(
          d =>
            b.available_qty === requested_qty - d ||
            b.available_qty === requested_qty + d
        )
      );

      response.push({
        product_id,
        requested_qty,
        exactBatchAvailable: false,
        suggested_batch: null,
        suggestions,
      });
    }

    await t.commit();
    res.json(response);
  } catch (err) {
    await t.rollback();
    console.error(err);
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
    if (!Array.isArray(items) || items.length === 0)
      throw new Error("No items");

    // 1️⃣ Create PI
    const pi = await ProformaInvoice.create(
      {
        customer_id,
        status: "PENDING_APPROVAL",
        expires_at: new Date(Date.now() + 7 * 86400000),
      },
      { transaction: t }
    );

    // 2️⃣ Process each item
    for (const item of items) {
      const { product_id, batch_no, collection_series_id } = item;

      // 🔒 Lock all hides of the selected batch
      const hides = await LeatherHideStock.findAll({
        where: {
          product_id,
          batch_no,
          status: "AVAILABLE",
        },
        order: [["id", "ASC"]],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!hides.length) {
        throw new Error(`No stock found for batch ${batch_no}`);
      }

      // 3️⃣ Consume FULL batch qty
      let batchTotalQty = 0;
      const batchInfo = [];

      for (const h of hides) {
        batchTotalQty += h.qty;

        batchInfo.push({
          hide_id: h.hide_id,
          batch_no,
          qty: h.qty,
        });

        h.status = "RESERVED";
        h.qty = 0;
        await h.save({ transaction: t });
      }

      // 4️⃣ Update product stock
      const stock = await LeatherStock.findOne({
        where: { product_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!stock || stock.available_qty < batchTotalQty) {
        throw new Error("Insufficient product stock");
      }

      stock.available_qty -= batchTotalQty;
      stock.reserved_qty += batchTotalQty;
      await stock.save({ transaction: t });

      // 5️⃣ Fetch price (CORRECT WAY)
      const price = await CollectionPrice.findOne({
        where: {
          collection_series_id,
          price_type,
          is_active: true,
        },
        transaction: t,
      });

      if (!price) {
        throw new Error(`Price not found for ${price_type}`);
      }

      // 6️⃣ Create PI Item
      await PIItem.create(
        {
          pi_id: pi.id,
          product_id,
          qty: batchTotalQty, // FULL batch qty
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
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pi) throw new Error("PI not found");
    if (pi.status !== "PENDING_APPROVAL") {
      throw new Error("Only PENDING_APPROVAL PI can be approved");
    }

    // 🔹 Calculate transport amount
    let transportAmount = 0;

    if (transport_type_id && weight_kg) {
      const transportType = await TransportType.findByPk(
        transport_type_id,
        { transaction: t }
      );

      if (!transportType) throw new Error("Invalid transport type");

      transportAmount = weight_kg * Number(transportType.base_price);
    }

    const finalTransportAmount =
      transport_payment_status === "PAID" ? 0 : transportAmount;

    // 🔹 Update PI
    await pi.update(
      {
        transport_type_id,
        transport_id,
        weight_kg,
        transport_payment_status,
        delivery_address,
        receiver_courier_name,
        transport_amount: finalTransportAmount,
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
              attributes: ["leather_code", "color", "image_url"],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json(pis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
