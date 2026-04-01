const { LeatherProduct, LeatherStock,LeatherHideStock,CollectionPrice, sequelize, CollectionSeries, SubCollection, MainCollection } = require("../../models");
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

exports.getProducts = async (req, res) => {
  try {
    const whereClause = {
      status: "ACTIVE",
    };

    // Support filtering by collection_series_id or by collection_id (main collection)
    if (req.query.collection_series_id) {
      whereClause.collection_series_id = req.query.collection_series_id;
    } else if (req.query.collection_id) {
      // Find all series that belong to this main collection
      const seriesRows = await sequelize.models.CollectionSeries.findAll({
        attributes: ['id'],
        include: [
          {
            model: sequelize.models.SubCollection,
            as: 'subCollection',
            where: { main_collection_id: req.query.collection_id },
            attributes: [],
          },
        ],
        raw: true,
      });
      const seriesIds = seriesRows.map(r => r.id);
      whereClause.collection_series_id = { [Op.in]: seriesIds.length ? seriesIds : [0] };
    }

    // Get location from query params, default to Bangalore
    const location = req.query.location || 'Bangalore';
    const stockWhereClause = { location };

    const products = await LeatherProduct.findAll({
      where: whereClause,
      include: [
        {
          model: LeatherStock,
          as: "stock",
          where: stockWhereClause,
          attributes: ["total_qty", "available_qty", "reserved_qty", "location"],
          required: false, // LEFT JOIN to include products even if no stock for this location
        },
        {
          model: CollectionSeries,
          as: "series",
          include: [
            {
              model: SubCollection,
              as: "subCollection",
              include: [
                {
                  model: MainCollection,
                  as: "mainCollection",
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!products.length) return res.json([]);

    // Load prices for all products
    const seriesIds = [...new Set(products.map(p => p.collection_series_id))];
    const prices = await CollectionPrice.findAll({
      where: {
        collection_series_id: { [Op.in]: seriesIds },
        is_active: true,
      },
      attributes: ["collection_series_id", "price_type", "price"],
      raw: true,
    });

    const priceMap = {};
    prices.forEach(p => {
      if (!priceMap[p.collection_series_id]) priceMap[p.collection_series_id] = {};
      priceMap[p.collection_series_id][p.price_type] = p.price;
    });

    const result = products.map(prod => {
      const p = prod.get({ plain: true });
      return {
        ...p,
        available_qty: p.stock?.available_qty || 0,
        total_qty: p.stock?.total_qty || 0,
        reserved_qty: p.stock?.reserved_qty || 0,
        location: p.stock?.location || location,
        main_collection_name: p.series?.subCollection?.mainCollection?.name || null,
        quantity_price: {
          DP: priceMap[p.collection_series_id]?.DP || 0,
          RRP: priceMap[p.collection_series_id]?.RRP || 0,
          ARCH: priceMap[p.collection_series_id]?.ARCH || 0,
        },
      };
    });
    res.json(result);
  } catch (error) {
    console.error("getProducts error:", error);
    res.status(500).json({ error: error.message });
  }
};

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
        include: [[fn("SUM", col("batches.qty")), "available_qty"]],
      },

      group: ["LeatherProduct.id"],
      order: [["createdAt", "DESC"]],
      raw: true,
    });

    if (!products.length) return res.json([]);

    const seriesIds = [
      ...new Set(products.map(p => p.collection_series_id)),
    ];

    const prices = await CollectionPrice.findAll({
      where: {
        collection_series_id: { [Op.in]: seriesIds },
        is_active: true,
      },
      attributes: [
        "collection_series_id",
        "price_type",
        "price",
      ],
      raw: true,
    });

    const priceMap = {};

    prices.forEach(p => {
      if (!priceMap[p.collection_series_id]) {
        priceMap[p.collection_series_id] = {};
      }
      priceMap[p.collection_series_id][p.price_type] = p.price;
    });

    const result = products.map(p => ({
      ...p,
      available_qty: Math.floor(Number(p.available_qty || 0) * 100) / 100,

      quantity_price: {
        DP: priceMap[p.collection_series_id]?.DP || 0,
        RRP: priceMap[p.collection_series_id]?.RRP || 0,
        ARCH: priceMap[p.collection_series_id]?.ARCH || 0,
      },
    }));

    res.json(result);
  } catch (error) {
    console.error("getAvailableProducts error:", error);
    res.status(500).json({ error: error.message });
  }
};

// 🎯 Get collection details with all colors and hide-wise breakdown
exports.getCollectionDetails = async (req, res) => {
  try {
    const { collection_id } = req.params; // MainCollection ID
    const location = req.query.location || 'Bangalore';

    // Step 1: Find all series that belong to this collection
    const seriesData = await sequelize.models.CollectionSeries.findAll({
      attributes: ['id', 'name'],
      include: [
        {
          model: sequelize.models.SubCollection,
          as: 'subCollection',
          attributes: ['id', 'name', 'main_collection_id'],
          where: { main_collection_id: collection_id },
        },
      ],
      raw: true,
    });

    if (!seriesData.length) {
      return res.json({
        collection_id,
        collection_name: null,
        colors: [],
        total_colors: 0,
        total_qty: 0,
      });
    }

    const seriesIds = seriesData.map(s => s.id);

    // Step 2: Get all products (colors) for these series
    const products = await LeatherProduct.findAll({
      where: {
        collection_series_id: { [Op.in]: seriesIds },
        status: 'ACTIVE',
      },
      include: [
        {
          model: LeatherStock,
          as: 'stock',
          attributes: ['total_qty', 'available_qty', 'reserved_qty', 'location'],
          where: { location },
          required: false,
        },
        {
          model: LeatherHideStock,
          as: 'batches',
          attributes: ['id', 'hide_code', 'batch_no', 'qty', 'grade', 'remarks', 'status'],
        },
        {
          model: CollectionSeries,
          as: 'series',
        },
      ],
      order: [['color', 'ASC']],
    });

    // Step 3: Format the response
    const colors = products.map(product => {
      const plain = product.get({ plain: true });
      const batches = plain.batches || [];
      
      return {
        id: plain.id,
        color: plain.color,
        leather_code: plain.leather_code,
        description: plain.description,
        image_url: plain.image_url,
        total_qty: plain.stock?.total_qty || 0,
        available_qty: plain.stock?.available_qty || 0,
        reserved_qty: plain.stock?.reserved_qty || 0,
        location: plain.stock?.location || location,
        hides: batches.map(batch => ({
          id: batch.id,
          hide_code: batch.hide_code,
          batch_no: batch.batch_no,
          qty: batch.qty,
          grade: batch.grade,
          remarks: batch.remarks,
          status: batch.status,
        })),
        total_hides: batches.length,
        total_hide_qty: batches.reduce((sum, b) => sum + (b.qty || 0), 0),
      };
    });

    // Get collection name
    const mainCollection = await MainCollection.findByPk(collection_id);

    res.json({
      collection_id,
      collection_name: mainCollection?.name || null,
      colors,
      total_colors: colors.length,
      total_qty: colors.reduce((sum, c) => sum + (c.total_qty || 0), 0),
      total_available_qty: colors.reduce((sum, c) => sum + (c.available_qty || 0), 0),
    });
  } catch (error) {
    console.error("getCollectionDetails error:", error);
    res.status(500).json({ error: error.message });
  }
};
