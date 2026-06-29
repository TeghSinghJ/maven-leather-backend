const { Op } = require("sequelize");
const { LeatherHideStock } = require("../../models");
const { recalculateLeatherStock } = require("../services/leatherStock.service");
const multer = require("multer");
const XLSX = require("xlsx");

const upload = multer({ storage: multer.memoryStorage() });

exports.bulkUploadHidesExcel = async (req, res) => {
  try {
    const { product_id } = req.body;

    if (!product_id)
      return res.status(400).json({ message: "product_id is required" });

    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    const workbook = XLSX.readFile(req.file.path || req.file.buffer, {
      type: req.file.buffer ? "buffer" : "file",
    });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (!data.length)
      return res.status(400).json({ message: "Excel is empty" });

    console.log("📋 Excel data sample:", data[0]);
    console.log("📋 Available columns:", Object.keys(data[0] || {}));

    // Map flexible column names (batch_no, Batch No, batch no, etc.)
    const normalizeRow = (row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        const lowerKey = String(key).toLowerCase().trim();
        
        // Match batch_no with variations
        if (lowerKey.includes('batch')) {
          normalized.batch_no = String(value).trim();
        }
        // Match qty with variations
        else if (lowerKey.includes('qty') || lowerKey.includes('quantity') || lowerKey.includes('qnt')) {
          normalized.qty = Number(value);
        }
        // Keep other columns as is
        else {
          normalized[key] = value;
        }
      }
      return normalized;
    };

    const validData = data
      .map(normalizeRow)
      .filter((row, index) => {
        const hasBatchNo = row.batch_no && String(row.batch_no).trim() !== '';
        const hasQty = row.qty && !isNaN(row.qty) && Number(row.qty) > 0;
        
        if (!hasBatchNo || !hasQty) {
          console.warn(`⚠️ Row ${index + 1} skipped: batch_no="${row.batch_no}", qty="${row.qty}"`);
        }
        return hasBatchNo && hasQty;
      });

    if (!validData.length) {
      console.error("❌ No valid rows found after filtering");
      return res.status(400).json({ 
        message: "No valid rows found. Excel must have 'Batch No' and 'Qty' columns with values",
        sample: data[0] ? Object.keys(data[0]) : [],
      });
    }

    console.log(`✓ Processing ${validData.length} valid rows`);

    const bulkData = validData.map((row, index) => ({
      product_id,
      hide_id: `HIDE-${Date.now()}-${index + 1}`,
      batch_no: String(row.batch_no).trim(),
      qty: Number(row.qty),
    }));

    const createdHides = await LeatherHideStock.bulkCreate(bulkData);

    await recalculateLeatherStock(product_id);

    res.status(201).json({
      message: "Hides imported successfully",
      count: createdHides.length,
      imported_rows: createdHides.map(h => ({ hide_id: h.hide_id, batch_no: h.batch_no, qty: h.qty })),
    });

  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ message: `Upload failed: ${err.message}` });
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
        // qty: { [Op.gt]: 0 }, 
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

// 🎯 NEW: Update individual hide details
exports.updateHide = async (req, res) => {
  try {
    const { id } = req.params;
    const { hide_code, batch_no, qty, grade, remarks } = req.body;

    const hide = await LeatherHideStock.findByPk(id);
    if (!hide) return res.status(404).json({ message: "Hide not found" });

    // Update fields
    if (hide_code !== undefined) hide.hide_code = hide_code;
    if (batch_no !== undefined) hide.batch_no = batch_no;

    if (qty !== undefined) {
      const qtyValue = Number(qty);
      if (Number.isNaN(qtyValue) || qtyValue < 0) {
        return res.status(400).json({ message: "Invalid quantity value" });
      }
      hide.qty = qtyValue;
    }

    if (grade !== undefined) hide.grade = grade;
    if (remarks !== undefined) hide.remarks = remarks;

    await hide.save();
    await recalculateLeatherStock(hide.product_id);

    res.json({ message: "Hide updated successfully", hide });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteBatchHides = async (req, res) => {
  try {
    const { productId, batchNo } = req.params;
    const decodedBatchNo = decodeURIComponent(batchNo || "");

    if (!productId || !decodedBatchNo) {
      return res.status(400).json({ message: "productId and batchNo are required" });
    }

    const deletedCount = await LeatherHideStock.destroy({
      where: {
        product_id: productId,
        batch_no: decodedBatchNo,
      },
    });

    await recalculateLeatherStock(productId);

    res.json({
      message: "Batch hides deleted successfully",
      deletedCount,
      batch_no: decodedBatchNo,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// 🎯 NEW: Delete individual hide
exports.deleteHide = async (req, res) => {
  try {
    const { id } = req.params;

    const hide = await LeatherHideStock.findByPk(id);
    if (!hide) return res.status(404).json({ message: "Hide not found" });

    const productId = hide.product_id;
    await hide.destroy();
    await recalculateLeatherStock(productId);

    res.json({ message: "Hide deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
