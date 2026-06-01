const { LeatherProduct, LeatherStock,LeatherHideStock,CollectionPrice, sequelize, CollectionSeries, SubCollection, MainCollection } = require("../../models");
const { body, validationResult } = require("express-validator");
const { Op, fn ,col} = require("sequelize"); // 👈 REQUIRED

exports.createProduct = [
  body("collection_series_id").isInt().withMessage("Collection Series ID is required"),
  body("leather_code").notEmpty().withMessage("Leather code is required"),
  body("color").notEmpty().withMessage("Color is required"),
  body("initial_qty").optional().isFloat({ min: 0 }).withMessage("Initial quantity must be a positive number"),
  body("location").optional().isIn(['Bangalore', 'Delhi', 'Mumbai']).withMessage("Invalid location"),

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

// Copy all other exports from the original file...
// (getProducts, getProductById, updateProduct, deleteProduct, getAvailableProducts, getCollectionDetails, etc.)
