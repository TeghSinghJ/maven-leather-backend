const { LeatherHideStock } = require("../../models");
const { recalculateLeatherStock } = require("../services/leatherStock.service");

// Create single hide stock
exports.createHideStock = async (req, res) => {
  try {
    const { product_id, batch_no, qty } = req.body;

    // backend generates hide_id
    const hide = await LeatherHideStock.create({
      product_id,
      hide_id: `HIDE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      batch_no,
      qty,
    });

    await recalculateLeatherStock(product_id);
    res.status(201).json(hide);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.createBulkHideStock = async (req, res) => {
  try {
    const { product_id, batch_no, hides } = req.body; 
    if (!Array.isArray(hides) || hides.length === 0)
      return res.status(400).json({ message: "No hides provided" });

    const bulkData = hides.map((h, index) => ({
      product_id,
      hide_id: `HIDE-${Date.now()}-${index + 1}`,
      batch_no,
      qty: h.qty,
    }));

    const createdHides = await LeatherHideStock.bulkCreate(bulkData);
    await recalculateLeatherStock(product_id);

    res.status(201).json({ message: "Bulk hides added", hides: createdHides });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.listByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const hides = await LeatherHideStock.findAll({ where: { product_id: productId } });
    res.json(hides);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Update hide status
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const hide = await LeatherHideStock.findByPk(id);
    if (!hide) return res.status(404).json({ message: "Not found" });

    hide.status = status;
    await hide.save();
    await recalculateLeatherStock(hide.product_id);

    res.json(hide);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
