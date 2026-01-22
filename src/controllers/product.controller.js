const { LeatherProduct, LeatherStock,LeatherHideStock, sequelize } = require("../../models");
const { body, validationResult } = require("express-validator");
const { Op, fn ,col} = require("sequelize"); // 👈 REQUIRED

exports.createProduct = [
  body("collection_series_id").isInt().withMessage("Collection Series ID is required"),
  body("leather_code").notEmpty().withMessage("Leather code is required"),
  body("color").notEmpty().withMessage("Color is required"),
  body("initial_qty").optional().isFloat({ min: 0 }).withMessage("Initial quantity must be a positive number"),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const transaction = await sequelize.transaction();
    try {
      const { collection_series_id, leather_code, color, description, initial_qty = 0 } = req.body;
      const image_url = req.file ? `/uploads/${req.file.filename}` : null;

      const product = await LeatherProduct.create(
        {
          collection_series_id,
          leather_code,
          color,
          description,
          image_url,
          status: "ACTIVE",
        },
        { transaction }
      );

      await LeatherStock.create(
        {
          product_id: product.id,
          total_qty: initial_qty,
          available_qty: initial_qty,
          reserved_qty: 0,
        },
        { transaction }
      );

      await transaction.commit();

      res.status(201).json({ message: "Leather product created successfully", product });
    } catch (error) {
      await transaction.rollback();
      res.status(400).json({ error: error.message });
    }
  },
];

/* ================= ADD STOCK ================= */
exports.addStock = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { qty } = req.body;
    if (!qty || qty <= 0) return res.status(400).json({ error: "Quantity must be positive" });

    const stock = await LeatherStock.findOne({
      where: { product_id: req.params.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!stock) {
      await transaction.rollback();
      return res.status(404).json({ error: "Stock not found" });
    }

    stock.total_qty += qty;
    stock.available_qty += qty;

    await stock.save({ transaction });
    await transaction.commit();

    res.json({ message: "Stock updated successfully", stock });
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ error: err.message });
  }
};

/* ================= GET ALL PRODUCTS ================= */
exports.getProducts = async (req, res) => {
  try {
    const whereClause = {
      status: "ACTIVE",
      ...(req.query.collection_series_id && { collection_series_id: req.query.collection_series_id }),
    };

    const products = await LeatherProduct.findAll({
      where: whereClause,
      include: [
        {
          model: LeatherStock,
          as: "stock",
          attributes: ["total_qty", "available_qty", "reserved_qty"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* ================= GET SINGLE PRODUCT ================= */
exports.getProductById = async (req, res) => {
  try {
    const product = await LeatherProduct.findByPk(req.params.id, {
      include: [
        {
          model: LeatherStock,
          as: "stock",
        },
      ],
    });

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= UPDATE PRODUCT ================= */
exports.updateProduct = async (req, res) => {
  try {
    const { leather_code, color, description, image_url } = req.body;

    const [updated] = await LeatherProduct.update(
      { leather_code, color, description, image_url },
      { where: { id: req.params.id, status: "ACTIVE" } }
    );

    if (!updated) return res.status(404).json({ message: "Product not found or inactive" });

    res.json({ message: "Product updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.deleteProduct = async (req, res) => {
  try {
    const [deleted] = await LeatherProduct.update(
      { status: "INACTIVE" },
      { where: { id: req.params.id } }
    );

    if (!deleted) return res.status(404).json({ message: "Product not found" });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAvailableProducts = async (req, res) => {
  try {
    const products = await LeatherProduct.findAll({
      where: { status: "ACTIVE" },

      include: [
        {
          model: LeatherHideStock,
          as: "batches",
          required: true,
          where: {
            status: "AVAILABLE",
            qty: { [Op.gt]: 0 },
          },
          attributes: [],
        },
      ],

      attributes: {
        include: [
          [fn("SUM", col("batches.qty")), "available_qty"],
        ],
      },

      group: ["LeatherProduct.id"],
      order: [["createdAt", "DESC"]],
      raw: true, 
    });

    const result = products.map((p) => ({
      ...p,
      available_qty: Math.floor(Number(p.available_qty || 0) * 100) / 100,
    }));

    res.json(result);
  } catch (error) {
    console.error("getAvailableProducts error:", error);
    res.status(500).json({ error: error.message });
  }
};
