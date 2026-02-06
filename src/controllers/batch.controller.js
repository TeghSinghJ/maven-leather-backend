const { Batch, LeatherProduct, CollectionSeries, LeatherHideStock, LeatherStock, sequelize } = require("../../models");
const { Op, Transaction } = require("sequelize");
const multer = require("multer");
const xlsx = require("xlsx");
const csv = require("csv-parse");
const fs = require("fs");
const path = require("path");

// ============================================
// BATCH CRUD OPERATIONS
// ============================================

exports.createBatch = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { batch_no, product_id, collection_series_id, description } = req.body;

    if (!batch_no || !product_id || !collection_series_id) {
      throw new Error("batch_no, product_id, and collection_series_id are required");
    }

    // Verify product exists
    const product = await LeatherProduct.findByPk(product_id, { transaction: t });
    if (!product) throw new Error("Product not found");

    // Verify collection series exists
    const series = await CollectionSeries.findByPk(collection_series_id, { transaction: t });
    if (!series) throw new Error("Collection Series not found");

    // Check for duplicate batch_no
    const existing = await Batch.findOne({
      where: { batch_no },
      transaction: t,
    });
    if (existing) throw new Error("Batch number already exists");

    const batch = await Batch.create(
      {
        batch_no,
        product_id,
        collection_series_id,
        description,
        status: "ACTIVE",
      },
      { transaction: t }
    );

    await t.commit();
    res.status(201).json({ message: "Batch created successfully", batch });
  } catch (err) {
    await t.rollback();
    console.error("Create Batch Error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.getBatches = async (req, res) => {
  try {
    const { product_id, collection_series_id } = req.query;
    const where = {};

    if (product_id) where.product_id = product_id;
    if (collection_series_id) where.collection_series_id = collection_series_id;

    const batches = await Batch.findAll({
      where,
      include: [
        {
          model: LeatherProduct,
          as: "product",
          attributes: ["id", "leather_code", "color"],
        },
        {
          model: CollectionSeries,
          as: "series",
          attributes: ["id", "name"],
        },
        {
          model: LeatherHideStock,
          as: "hides",
          attributes: ["id", "hide_id", "qty", "hide_code", "grade", "status"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json(batches);
  } catch (err) {
    console.error("Get Batches Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getBatchById = async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await Batch.findByPk(id, {
      include: [
        {
          model: LeatherProduct,
          as: "product",
          attributes: ["id", "leather_code", "color", "collection_series_id"],
        },
        {
          model: CollectionSeries,
          as: "series",
          attributes: ["id", "name"],
        },
        {
          model: LeatherHideStock,
          as: "hides",
          attributes: ["id", "hide_id", "qty", "hide_code", "grade", "remarks", "status"],
        },
      ],
    });

    if (!batch) return res.status(404).json({ error: "Batch not found" });

    res.json(batch);
  } catch (err) {
    console.error("Get Batch Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateBatch = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { id } = req.params;
    const { description, status } = req.body;

    const batch = await Batch.findByPk(id, { transaction: t });
    if (!batch) throw new Error("Batch not found");

    if (description !== undefined) batch.description = description;
    if (status !== undefined) batch.status = status;

    await batch.save({ transaction: t });
    await t.commit();

    res.json({ message: "Batch updated successfully", batch });
  } catch (err) {
    await t.rollback();
    console.error("Update Batch Error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.deleteBatch = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { id } = req.params;

    const batch = await Batch.findByPk(id, {
      include: [{ model: LeatherHideStock, as: "hides" }],
      transaction: t,
    });

    if (!batch) throw new Error("Batch not found");

    // Delete all hides in the batch
    await LeatherHideStock.destroy({
      where: { batch_id: id },
      transaction: t,
    });

    // Delete batch
    await batch.destroy({ transaction: t });
    await t.commit();

    res.json({ message: "Batch deleted successfully" });
  } catch (err) {
    await t.rollback();
    console.error("Delete Batch Error:", err);
    res.status(400).json({ error: err.message });
  }
};

// ============================================
// MANUAL HIDE ENTRY
// ============================================

exports.addHide = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { batch_id } = req.params;
    const { qty, hide_code, grade, remarks } = req.body;

    if (!qty) throw new Error("Hide size (qty) is required");

    // Verify batch exists
    const batch = await Batch.findByPk(batch_id, { transaction: t });
    if (!batch) throw new Error("Batch not found");

    // Generate hide_id if not provided
    const generated_hide_id = `HIDE-${batch_id}-${Date.now()}`;

    const hide = await LeatherHideStock.create(
      {
        batch_id,
        product_id: batch.product_id,
        hide_id: generated_hide_id,
        batch_no: batch.batch_no,
        qty: Number(qty),
        hide_code: hide_code || null,
        grade: grade || null,
        remarks: remarks || null,
        status: "AVAILABLE",
      },
      { transaction: t }
    );

    // Update product stock aggregate
    let stock = await LeatherStock.findOne({
      where: { product_id: batch.product_id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!stock) {
      stock = await LeatherStock.create(
        {
          product_id: batch.product_id,
          available_qty: Number(qty),
          reserved_qty: 0,
        },
        { transaction: t }
      );
    } else {
      stock.available_qty += Number(qty);
      await stock.save({ transaction: t });
    }

    await t.commit();
    res.status(201).json({ message: "Hide added successfully", hide });
  } catch (err) {
    await t.rollback();
    console.error("Add Hide Error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.updateHide = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { hide_id } = req.params;
    const { qty, grade, remarks, status } = req.body;

    const hide = await LeatherHideStock.findByPk(hide_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!hide) throw new Error("Hide not found");

    const oldQty = hide.qty;

    if (qty !== undefined) hide.qty = Number(qty);
    if (grade !== undefined) hide.grade = grade;
    if (remarks !== undefined) hide.remarks = remarks;
    if (status !== undefined) hide.status = status;

    await hide.save({ transaction: t });

    // Update product stock if qty changed
    if (oldQty !== Number(qty)) {
      const diff = Number(qty) - oldQty;
      const stock = await LeatherStock.findOne({
        where: { product_id: hide.product_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (stock) {
        stock.available_qty += diff;
        await stock.save({ transaction: t });
      }
    }

    await t.commit();
    res.json({ message: "Hide updated successfully", hide });
  } catch (err) {
    await t.rollback();
    console.error("Update Hide Error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.deleteHide = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { hide_id } = req.params;

    const hide = await LeatherHideStock.findByPk(hide_id, { transaction: t });
    if (!hide) throw new Error("Hide not found");

    const product_id = hide.product_id;
    const qty = hide.qty;

    // Delete hide
    await hide.destroy({ transaction: t });

    // Update product stock
    const stock = await LeatherStock.findOne({
      where: { product_id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (stock) {
      stock.available_qty -= qty;
      if (stock.available_qty < 0) stock.available_qty = 0;
      await stock.save({ transaction: t });
    }

    await t.commit();
    res.json({ message: "Hide deleted successfully" });
  } catch (err) {
    await t.rollback();
    console.error("Delete Hide Error:", err);
    res.status(400).json({ error: err.message });
  }
};

// ============================================
// BULK HIDE UPLOAD (CSV/EXCEL)
// ============================================

exports.bulkUploadHides = async (req, res) => {
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const { batch_id } = req.params;

    if (!req.file) throw new Error("No file provided");

    // Verify batch exists
    const batch = await Batch.findByPk(batch_id, { transaction: t });
    if (!batch) throw new Error("Batch not found");

    const filePath = req.file.path;
    let rows = [];

    // Parse CSV or Excel
    if (req.file.mimetype.includes("sheet") || filePath.endsWith(".xlsx")) {
      // Excel file
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = xlsx.utils.sheet_to_json(sheet);
    } else if (req.file.mimetype.includes("csv") || filePath.endsWith(".csv")) {
      // CSV file
      const content = fs.readFileSync(filePath, "utf-8");
      rows = await new Promise((resolve, reject) => {
        csv.parse(content, { columns: true }, (err, records) => {
          if (err) reject(err);
          else resolve(records);
        });
      });
    } else {
      throw new Error("Unsupported file format. Use CSV or Excel.");
    }

    // Validate and process hides
    const errors = [];
    const createdHides = [];
    let totalQty = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Validate required fields
      const qty = Number(row["Hide Size"] || row["hide_size"] || row["qty"]);
      if (!qty || isNaN(qty) || qty <= 0) {
        errors.push(`Row ${i + 2}: Invalid or missing Hide Size`);
        continue;
      }

      const hide_code = row["Hide Code"] || row["hide_code"] || null;
      const grade = row["Grade"] || row["grade"] || null;
      const remarks = row["Remarks"] || row["remarks"] || null;

      try {
        const hide = await LeatherHideStock.create(
          {
            batch_id,
            product_id: batch.product_id,
            hide_id: `HIDE-${batch_id}-${Date.now()}-${i}`,
            batch_no: batch.batch_no,
            qty,
            hide_code,
            grade,
            remarks,
            status: "AVAILABLE",
          },
          { transaction: t }
        );

        createdHides.push(hide);
        totalQty += qty;
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err.message}`);
      }
    }

    // Update product stock aggregate
    if (createdHides.length > 0) {
      let stock = await LeatherStock.findOne({
        where: { product_id: batch.product_id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!stock) {
        stock = await LeatherStock.create(
          {
            product_id: batch.product_id,
            available_qty: totalQty,
            reserved_qty: 0,
          },
          { transaction: t }
        );
      } else {
        stock.available_qty += totalQty;
        await stock.save({ transaction: t });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    await t.commit();

    res.json({
      message: "Bulk upload completed",
      created: createdHides.length,
      total_qty: totalQty,
      errors: errors.length > 0 ? errors : undefined,
      hides: createdHides,
    });
  } catch (err) {
    await t.rollback();
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Bulk Upload Error:", err);
    res.status(400).json({ error: err.message });
  }
};

// ============================================
// GET BATCH HIDE STATISTICS
// ============================================

exports.getBatchStats = async (req, res) => {
  try {
    const { batch_id } = req.params;

    const batch = await Batch.findByPk(batch_id, {
      include: [
        {
          model: LeatherHideStock,
          as: "hides",
          attributes: ["id", "qty", "status"],
        },
      ],
    });

    if (!batch) return res.status(404).json({ error: "Batch not found" });

    const stats = {
      batch_id,
      batch_no: batch.batch_no,
      total_hides: batch.hides.length,
      total_qty: batch.hides.reduce((sum, h) => sum + (h.qty || 0), 0),
      available: batch.hides.filter((h) => h.status === "AVAILABLE").length,
      reserved: batch.hides.filter((h) => h.status === "RESERVED").length,
      blocked: batch.hides.filter((h) => h.status === "BLOCKED").length,
    };

    res.json(stats);
  } catch (err) {
    console.error("Get Batch Stats Error:", err);
    res.status(500).json({ error: err.message });
  }
};
