const {
  ProformaInvoice,
  PIItem,
  LeatherStock,
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
      items,
    } = req.body;

    if (!items || items.length === 0) {
      throw new Error("No items provided for PI");
    }

    // 1️⃣ Lock ALL required stock rows first
    const productIds = items.map(i => i.product_id);

    const stocks = await LeatherStock.findAll({
      where: { product_id: { [Op.in]: productIds } },
      transaction: t,
      lock: t.LOCK.UPDATE, // 🔒 CRITICAL
    });

    const stockMap = {};
    stocks.forEach(s => {
      stockMap[s.product_id] = s;
    });

    // 2️⃣ Validate stock under lock
    for (const item of items) {
      const stock = stockMap[item.product_id];
      if (!stock || stock.available_qty < item.qty) {
        throw new Error(`Insufficient stock for product ${item.product_id}`);
      }
    }

    // 3️⃣ Create PI
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7);

    const pi = await ProformaInvoice.create(
      {
        customer_name,
        whatsapp_number,
        address,
        state,
        gst_number,
        contact_number,
        pin_code,
        status: "ACTIVE",
        expires_at,
      },
      { transaction: t }
    );

    // 4️⃣ Create items + reserve stock atomically
    for (const item of items) {
      await PIItem.create(
        {
          pi_id: pi.id,
          product_id: item.product_id,
          qty: item.qty,
          rate: item.rate, 
        },
        { transaction: t }
      );

      const stock = stockMap[item.product_id];
      stock.available_qty -= item.qty;
      stock.reserved_qty += item.qty;
      await stock.save({ transaction: t });
    }

    await t.commit();
    res.status(201).json({
      message: "PI created & stock reserved successfully",
      pi_id: pi.id,
    });
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
