const {
  LeatherStock,
  ProformaInvoice,
  PIItem,
  CollectionPrice,
  LeatherHideStock,
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
      transport_name,
      receiver_courier_name,
      delivery_address,
      bus_company_details,
      price_type, // <-- new field from UI
      items,
    } = req.body;

    if (!items || items.length === 0) {
      throw new Error("No items provided for PI");
    }

    const pi = await ProformaInvoice.create(
      {
        customer_name,
        whatsapp_number,
        address,
        state,
        gst_number,
        contact_number,
        pin_code,
        transport_name,
        receiver_courier_name,
        delivery_address,
        bus_company_details,
        status: "ACTIVE",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      { transaction: t }
    );

    for (const item of items) {
      // Pick the CollectionPrice based on price_type
      const priceObj = await CollectionPrice.findOne({
        where: { collection_series_id: item.collection_series_id, price_type },
      });

      if (!priceObj) {
        throw new Error(
          `No price defined for product ${item.product_id} with type ${price_type}`
        );
      }

      // Find LeatherHideStock batches for this product
      const hideStocks = await LeatherHideStock.findAll({
        where: { product_id: item.product_id, status: "AVAILABLE" },
        order: [["batch_no", "ASC"]],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      let qtyRemaining = item.qty;
      const usedBatches = [];

      for (const stock of hideStocks) {
        if (qtyRemaining <= 0) break;

        if (stock.qty >= qtyRemaining) {
          usedBatches.push({ hide_id: stock.hide_id, qty: qtyRemaining });
          stock.qty -= qtyRemaining;
          stock.status = stock.qty === 0 ? "RESERVED" : "AVAILABLE";
          await stock.save({ transaction: t });
          qtyRemaining = 0;
        } else {
          usedBatches.push({ hide_id: stock.hide_id, qty: stock.qty });
          qtyRemaining -= stock.qty;
          stock.qty = 0;
          stock.status = "RESERVED";
          await stock.save({ transaction: t });
        }
      }

      if (qtyRemaining > 0) {
        throw new Error(
          `Insufficient stock for product ${item.product_id}`
        );
      }

      await PIItem.create(
        {
          pi_id: pi.id,
          product_id: item.product_id,
          qty: item.qty,
          rate: priceObj.price,
          batch_info: JSON.stringify(usedBatches),
        },
        { transaction: t }
      );
    }

    await t.commit();
    res.status(201).json({ message: "PI created successfully", pi_id: pi.id });
  } catch (err) {
    await t.rollback();
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
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json(pis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.cancelPI = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const pi = await ProformaInvoice.findByPk(req.params.id, {
      include: [{ model: PIItem, as: "items" }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pi) throw new Error("PI not found");
    if (pi.status !== "ACTIVE") throw new Error("Only ACTIVE PI can be cancelled");

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
      stock.available_qty += item.qty;
      stock.reserved_qty -= item.qty;
      await stock.save({ transaction: t });
    }

    pi.status = "CANCELLED";
    await pi.save({ transaction: t });

    await t.commit();
    res.json({ message: "PI cancelled and stock released" });
  } catch (err) {
    await t.rollback();
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
