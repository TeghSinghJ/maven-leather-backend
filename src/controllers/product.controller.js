const { LeatherProduct, LeatherStock,LeatherHideStock,CollectionPrice, sequelize, CollectionSeries, SubCollection, MainCollection } = require("../../models");
const { body, validationResult } = require("express-validator");
const { Op, fn ,col} = require("sequelize"); // 👈 REQUIRED

exports.createProduct = [
  body("collection_series_id").isInt().withMessage("Collection Series ID is required"),
  body("leather_code").notEmpty().withMessage("Leather code is required"),
  body("color").notEmpty().withMessage("Color is required"),
  body("initial_qty").optional().isFloat({ min: 0 }).withMessage("Initial quantity must be a positive number"),
  body("location").optional().isIn(['Bangalore', 'Delhi', 'Mumbai', 'Western Colours', 'Italy']).withMessage("Invalid location"),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const transaction = await sequelize.transaction();
    try {
      const { collection_series_id, leather_code, color, description, initial_qty = 0, location = 'Bangalore' } = req.body;
      console.log("Creating product with data:", { collection_series_id, leather_code, color, description, initial_qty, location });
      
      const image_url = req.file ? `/uploads/${req.file.filename}` : null;

      // Check if product already exists (by leather_code + color combination)
      let product = await LeatherProduct.findOne({
        where: { 
          leather_code,
          color,
          collection_series_id: parseInt(collection_series_id)
        },
        transaction
      });

      if (!product) {
        // Create new product only if it doesn't exist
        product = await LeatherProduct.create(
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
        console.log("New product created:", product.id);
      } else {
        console.log("Product already exists with ID:", product.id);
      }

      // Always create stock for the specified location
      const existingStock = await LeatherStock.findOne({
        where: {
          product_id: product.id,
          location
        },
        transaction
      });

      if (existingStock) {
        // Update existing stock for this location
        await existingStock.update(
          {
            total_qty: existingStock.total_qty + parseFloat(initial_qty),
            available_qty: existingStock.available_qty + parseFloat(initial_qty),
          },
          { transaction }
        );
        console.log(`Stock updated for location ${location}`);
      } else {
        // Create new stock for this location
        await LeatherStock.create(
          {
            product_id: product.id,
            total_qty: parseFloat(initial_qty),
            available_qty: parseFloat(initial_qty),
            reserved_qty: 0,
            location,
          },
          { transaction }
        );
        console.log(`Stock created for location ${location}`);
      }

      await transaction.commit();

      res.status(201).json({ message: "Product and stock saved successfully", product });
    } catch (error) {
      await transaction.rollback();
      console.error("createProduct error:", error);
      
      res.status(400).json({ 
        error: error.message,
        details: error.errors ? error.errors.map(e => e.message) : null,
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
    const validLocations = ['Bangalore', 'Delhi', 'Mumbai', 'Western Colours', 'Italy'];
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
    // DEBUG: Log incoming request
    console.log('🔍 getProducts called with params:', {
      location: req.query.location,
      collection_id: req.query.collection_id,
      collection_series_id: req.query.collection_series_id,
      price_list: req.query.price_list,
    });

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

    // Get location from query params
    const location = req.query.location;
    const stockWhereClause = location ? { location } : {};
    // When location is specified, use LEFT JOIN so products without stock in that location still appear with zero values
    const stockRequired = false;

    const products = await LeatherProduct.findAll({
      where: whereClause,
      include: [
        {
          model: LeatherStock,
          as: "stock",
          where: stockWhereClause,
          attributes: ["total_qty", "available_qty", "reserved_qty", "location"],
          required: stockRequired,
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

    // CRITICAL FIX: Deduplicate products by ID to handle multiple stock rows
    // (This shouldn't happen with required:true + location filter, but we ensure it here)
    const seenProductIds = new Set();
    const deduplicatedProducts = products.filter(prod => {
      if (seenProductIds.has(prod.id)) {
        console.warn(`⚠️  DUPLICATE PRODUCT DETECTED: ${prod.leather_code} (ID: ${prod.id})`);
        return false; // Skip duplicate
      }
      seenProductIds.add(prod.id);
      return true;
    });

    console.log(`📊 Query returned ${products.length} products, ${deduplicatedProducts.length} after deduplication`);
    if (products.length > deduplicatedProducts.length) {
      console.warn(`⚠️  Found ${products.length - deduplicatedProducts.length} duplicate products!`);
    }

    // Load prices for all products
    const seriesIds = [...new Set(deduplicatedProducts.map(p => p.collection_series_id))];
    
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

    const result = deduplicatedProducts.map(prod => {
      const p = prod.get({ plain: true });
      // Handle stock being an array (shouldn't happen with limit: 1, but fallback just in case)
      const stock = Array.isArray(p.stock) ? p.stock[0] : p.stock;
      return {
        ...p,
        available_qty: stock?.available_qty || 0,
        total_qty: stock?.total_qty || 0,
        reserved_qty: stock?.reserved_qty || 0,
        location: stock?.location || location || 'Bangalore',
        main_collection_name: p.series?.subCollection?.mainCollection?.name || null,
        quantity_price: {
          DP: priceMap[p.collection_series_id]?.DP || 0,
          RRP: priceMap[p.collection_series_id]?.RRP || 0,
          ARCH: priceMap[p.collection_series_id]?.ARCH || 0,
        },
      };
    });
    console.log(`✅ Returning ${result.length} products for location: ${location || 'ALL'}`);
    console.log(`📋 Products returned: ${result.map(r => r.leather_code).join(', ')}`);
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

    // Step 2: Get all products (colors) for these series with location-filtered stock
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
          required: true, // INNER JOIN to only get products with stock in this location
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

    // CRITICAL FIX: Deduplicate products by ID to handle multiple stock rows
    const seenProductIds = new Set();
    const deduplicatedProducts = products.filter(prod => {
      if (seenProductIds.has(prod.id)) {
        return false; // Skip duplicate
      }
      seenProductIds.add(prod.id);
      return true;
    });

    // Step 3: Format the response
    const colors = deduplicatedProducts.map(product => {
      const plain = product.get({ plain: true });
      const batches = plain.batches || [];
      // Handle stock being an array (shouldn't happen with required:true, but fallback just in case)
      const stock = Array.isArray(plain.stock) ? plain.stock[0] : plain.stock;
      
      return {
        id: plain.id,
        color: plain.color,
        leather_code: plain.leather_code,
        description: plain.description,
        image_url: plain.image_url,
        total_qty: stock?.total_qty || 0,
        available_qty: stock?.available_qty || 0,
        reserved_qty: stock?.reserved_qty || 0,
        location: stock?.location || location,
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
