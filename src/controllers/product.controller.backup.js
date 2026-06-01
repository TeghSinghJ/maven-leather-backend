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
    if (!errors.isEmpty()) {
      console.error("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const transaction = await sequelize.transaction();
    try {
      const { collection_series_id, leather_code, color, description, initial_qty = 0 } = req.body;
      console.log("Creating product with data:", { collection_series_id, leather_code, color, description, initial_qty });
      
      const image_url = req.file ? `/uploads/${req.file.filename}` : null;

      const product = await LeatherProduct.create(
        {
          collection_series_id: parseInt(collection_series_id),
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
          total_qty: parseFloat(initial_qty),
          available_qty: parseFloat(initial_qty),
          reserved_qty: 0,
          location: "Bangalore",
        },
        { transaction }
      );

      await transaction.commit();

      console.log("Product created successfully:", product.id);
      res.status(201).json({ message: "Leather product created successfully", product });
    } catch (error) {
      await transaction.rollback();
      console.error("createProduct error:", error);
      
      // Handle unique constraint violation
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ 
          error: `Product with leather code "${leather_code}" and color "${color}" already exists in this series`
        });
      }
      
      res.status(400).json({ 
        error: error.message,
        details: error.errors ? error.errors.map(e => e.message) : null,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },
];

exports.addStock = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { qty, location } = req.body;
    console.log("addStock request:", { qty, location, productId: req.params.id });
    
    if (!qty || qty <= 0) return res.status(400).json({ error: "Quantity must be positive" });
    
    // Validate location if provided
    const validLocations = ['Bangalore', 'Delhi', 'Mumbai'];
    const stockLocation = location || "Bangalore";
    if (!validLocations.includes(stockLocation)) {
      return res.status(400).json({ error: `Invalid location. Must be one of: ${validLocations.join(', ')}` });
    }

    let stock = await LeatherStock.findOne({
      where: { product_id: req.params.id, location: stockLocation },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!stock) {
      stock = await LeatherStock.create(
        {
          product_id: req.params.id,
          location: stockLocation,
          total_qty: 0,
          available_qty: 0,
          reserved_qty: 0,
        },
        { transaction }
      );
    }

    stock.total_qty += qty;
    stock.available_qty += qty;

    await stock.save({ transaction });
    await transaction.commit();

    console.log("Stock updated successfully:", { productId: req.params.id, location: stockLocation, qty });
    res.json({ message: "Stock updated successfully", stock });
  } catch (err) {
    await transaction.rollback();
    console.error("addStock error:", err);
    res.status(400).json({ 
      error: err.message,
      details: err.errors ? err.errors.map(e => e.message) : err.stack
    });
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

    // Get location from query params; if not present, include any stock row
    const location = req.query.location;
    const stockWhereClause = location ? { location } : {};

    const products = await LeatherProduct.findAll({
      where: whereClause,
      include: [
        {
          model: LeatherStock,
          as: "stock",
          where: stockWhereClause,
          attributes: ["total_qty", "available_qty", "reserved_qty", "location"],
          required: false, // LEFT JOIN to include products even if no stock rows
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
    
    // Support price_list filtering (WESTERN or MARVIN)
    const priceListFilter = req.query.price_list || 'MARVIN';
    
    const prices = await CollectionPrice.findAll({
      where: {
        collection_series_id: { [Op.in]: seriesIds },
        is_active: true,
        price_list: priceListFilter,
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

    console.log("Product updated successfully:", req.params.id);
    res.json({ message: "Product updated successfully" });
  } catch (err) {
    console.error("updateProduct error:", err);
    
    // Handle unique constraint violation
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        error: `Another product with leather code "${req.body.leather_code}" and color "${req.body.color}" already exists`
      });
    }
    
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

    // Support price_list filtering (WESTERN or MARVIN)
    const priceListFilter = req.query.price_list || 'MARVIN';

    const prices = await CollectionPrice.findAll({
      where: {
        collection_series_id: { [Op.in]: seriesIds },
        is_active: true,
        price_list: priceListFilter,
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

// Bulk add stock by collection series
exports.bulkAddStockByCollection = async (req, res) => {
  try {
    const { collection_series_id, qty, location } = req.body;

    if (!collection_series_id || qty == null) {
      return res.status(400).json({ message: "collection_series_id and qty are required" });
    }

    // Get the series to determine location if not provided
    const series = await CollectionSeries.findByPk(collection_series_id);
    if (!series) {
      return res.status(404).json({ message: "Collection series not found" });
    }

    const stockLocation = location || series.location || 'Bangalore';

    // Find all products in this collection series
    const products = await LeatherProduct.findAll({
      where: { collection_series_id, status: 'ACTIVE' },
      attributes: ['id', 'leather_code', 'color'],
    });

    if (!products.length) {
      return res.status(404).json({ message: "No active products found in this collection series" });
    }

    const transaction = await sequelize.transaction();
    let updatedCount = 0;

    try {
      for (const product of products) {
        // Check if stock exists for this product and location
        let stock = await LeatherStock.findOne({
          where: { product_id: product.id, location: stockLocation },
          transaction,
        });

        if (stock) {
          // Update existing stock
          stock.total_qty += qty;
          stock.available_qty += qty;
          await stock.save({ transaction });
        } else {
          // Create new stock entry
          await LeatherStock.create({
            product_id: product.id,
            total_qty: qty,
            available_qty: qty,
            reserved_qty: 0,
            location: stockLocation,
          }, { transaction });
        }
        updatedCount++;
      }

      await transaction.commit();

      res.json({
        message: `Stock added successfully to ${updatedCount} products in collection series`,
        collection_series_id,
        qty_added: qty,
        location: stockLocation,
        products_updated: updatedCount,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("bulkAddStockByCollection error:", error);
    res.status(500).json({ error: error.message });
  }
};
