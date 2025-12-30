const {
  ProformaInvoice,
  PIItem,
  LeatherStock,
  LeatherProduct,
  sequelize,
} = require("../../models");
const { Op } = require("sequelize");
const generateExactPIPdf = require("../utils/piPdf");

exports.createPI = async (req, res) => {
  const t = await sequelize.transaction();
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

    // Validate stock for each item
    for (const item of items) {
      const stock = await LeatherStock.findOne({
        where: { product_id: item.product_id },
        transaction: t,
      });
      if (!stock || stock.available_qty < item.qty) {
        throw new Error(`Insufficient stock for product_id ${item.product_id}`);
      }
    }

    // Create PI
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

    // Create PI items and reserve stock
    for (const item of items) {
      await PIItem.create(
        {
          pi_id: pi.id,
          product_id: item.product_id,
          qty: item.qty,
        },
        { transaction: t }
      );

      const stock = await LeatherStock.findOne({
        where: { product_id: item.product_id },
        transaction: t,
      });

      stock.available_qty -= item.qty;
      stock.reserved_qty += item.qty;
      await stock.save({ transaction: t });
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
    const { id } = req.params;

    const pi = await ProformaInvoice.findByPk(id, {
      include: [{ model: PIItem, as: "items" }],
      transaction: t,
      lock: true,
    });

    if (!pi) {
      throw new Error("PI not found");
    }

    if (pi.status !== "ACTIVE") {
      throw new Error("Only ACTIVE PI can be cancelled");
    }

    for (const item of pi.items) {
      const stock = await LeatherStock.findOne({
        where: { product_id: item.product_id },
        transaction: t,
        lock: true,
      });

      stock.available_qty += item.qty;
      stock.reserved_qty -= item.qty;
      await stock.save({ transaction: t });
    }

    pi.status = "CANCELLED";
    await pi.save({ transaction: t });

    await t.commit();
    res.json({ message: "PI cancelled and stock unreserved successfully" });
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
