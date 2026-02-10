const { Op } = require("sequelize");
const { LeatherHideStock } = require("../../models");
const { recalculateLeatherStock } = require("../services/leatherStock.service");
const ExcelJS = require("exceljs");
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });

exports.bulkUploadHidesExcel = async (req, res) => {
  try {
    const { product_id } = req.body;
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (!data.length) return res.status(400).json({ message: "Excel is empty" });

    const validData = data.filter(row => row.batch_no && row.qty);
    if (!validData.length) return res.status(400).json({ message: "No valid rows found" });

    const bulkData = validData.map((row, index) => ({
      product_id,
      hide_id: `HIDE-${Date.now()}-${index + 1}`,
      batch_no: row.batch_no,
      qty: Number(row.qty),
    }));

    const createdHides = await LeatherHideStock.bulkCreate(bulkData);

    await recalculateLeatherStock(product_id);

    res.status(201).json({ message: "Hides imported", count: createdHides.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.createHideStock = async (req, res) => {
  try {
    const { product_id, batch_no, qty } = req.body;

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

    const hides = await LeatherHideStock.findAll({
      where: {
        product_id: productId,
        qty: { [Op.gt]: 0 }, 
      },
    });

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
