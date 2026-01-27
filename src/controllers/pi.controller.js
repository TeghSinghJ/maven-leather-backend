const {
  LeatherStock,
  ProformaInvoice,
  PIItem,
  CollectionPrice,
  LeatherHideStock,
  TransportType,
  Transport,
  LeatherProduct,
  sequelize,
} = require("../../models");
const { Op ,Transaction} = require("sequelize");
const generateExactPIPdf = require("../utils/piPdf");
exports.createPI = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const {
      customer_name,
      whatsapp_number,
      address,
      state,
      gst_number,
      contact_number,
      pin_code,
      price_type,
      items,
      delivery_address,
      receiver_courier_name,
      transport_type_id,
      transport_id,
      weight_kg,
      transport_payment_status,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No items provided for PI");
    }

    let transportAmount = 0;

    if (transport_type_id && weight_kg) {
      const transportType = await TransportType.findByPk(transport_type_id, {
        transaction: t,
      });

      if (!transportType) {
        throw new Error("Invalid transport type");
      }

      transportAmount =
        Number(weight_kg) * Number(transportType.base_price);
    }

    const finalTransportAmount =
      transport_payment_status === "PAID" ? 0 : transportAmount;

    const pi = await ProformaInvoice.create(
      {
        customer_name,
        whatsapp_number,
        address,
        state,
        gst_number,
        receiver_courier_name,
        delivery_address,
        contact_number,
        pin_code,

        transport_type_id,
        transport_id,
        weight_kg,
        transport_payment_status,
        transport_amount: finalTransportAmount,

        status: "ACTIVE",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      { transaction: t }
    );

    for (const item of items) {
      if (!item.product_id || !item.qty || item.qty <= 0) {
        throw new Error("Invalid item payload");
      }

      const priceObj = await CollectionPrice.findOne({
        where: {
          collection_series_id: item.collection_series_id,
          price_type,
        },
        transaction: t,
      });

      if (!priceObj) {
        throw new Error("Price not defined for product");
      }

      const leatherStock = await LeatherStock.findOne({
        where: { product_id: item.product_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!leatherStock || leatherStock.available_qty < item.qty) {
        throw new Error("Insufficient stock");
      }

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

      leatherStock.reserved_qty += item.qty;
      leatherStock.available_qty -= item.qty;
      await leatherStock.save({ transaction: t });

      await PIItem.create(
        {
          pi_id: pi.id,
          product_id: item.product_id,
          qty: item.qty,
          rate: priceObj.price,
          batch_info: usedBatches,
        },
        { transaction: t }
      );
    }

    await t.commit();

    return res.status(201).json({
      message: "Proforma Invoice created successfully",
      pi_id: pi.id,
    });
  } catch (error) {
    await t.rollback();
    return res.status(400).json({ error: error.message });
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
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json(pis);
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
