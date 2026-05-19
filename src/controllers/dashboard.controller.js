const {
  MainCollection,
  SubCollection,
  CollectionSeries,
  LeatherProduct,
  LeatherStock,
  ProformaInvoice,
} = require("../../models");
const stockAnalysisService = require("../services/stockAnalysis.service");

exports.getDashboardCounts = async (req, res) => {
  try {
    const [
      mainCollections,
      subCollections,
      collectionSeries,
      totalProducts,
      activeProducts,

      totalPIs,
      activePIs,
      confirmedPIs,
      expiredPIs,

      productsWithStock,
      outOfStockProducts,
    ] = await Promise.all([
      MainCollection.count(),

      SubCollection.count(),

      CollectionSeries.count(),

      LeatherProduct.count(),

      LeatherProduct.count({
        where: { status: "ACTIVE" },
      }),

      ProformaInvoice.count(),

      ProformaInvoice.count({
        where: { status: "ACTIVE" },
      }),

      ProformaInvoice.count({
        where: { status: "CONFIRMED" },
      }),

      ProformaInvoice.count({
        where: { status: "EXPIRED" },
      }),

      LeatherProduct.count({
        include: [
          {
            model: LeatherStock,
            as: "stock",
            where: {
              available_qty: {
                [require("sequelize").Op.gt]: 0,
              },
            },
            required: true,
          },
        ],
      }),

      LeatherProduct.count({
        include: [
          {
            model: LeatherStock,
            as: "stock",
            where: {
              available_qty: 0,
            },
            required: true,
          },
        ],
      }),
    ]);

    return res.json({
      success: true,
      data: {
        collections: {
          main: mainCollections,
          sub: subCollections,
          series: collectionSeries,
        },
        products: {
          total: totalProducts,
          active: activeProducts,
          withStock: productsWithStock,
          outOfStock: outOfStockProducts,
        },
        proformaInvoices: {
          total: totalPIs,
          active: activePIs,
          confirmed: confirmedPIs,
          expired: expiredPIs,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard count error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard counts",
    });
  }
};

exports.getAllStocks = async (req, res) => {
  try {
    const stocks = await LeatherStock.findAll({
      include: [
        {
          model: LeatherProduct,
          as: "product",
          attributes: ["id", "leather_code", "color"],
        },
      ],
      attributes: ["id", "available_qty"],
      raw: false,
    });

    // Convert to plain JSON to ensure associations are included
    const formattedStocks = stocks.map((stock) => stock.toJSON());

    res.json(formattedStocks);
  } catch (error) {
    console.error("Get all stocks error:", error);
    res.status(500).json({ error: "Failed to fetch stocks" });
  }
};

exports.getStocksByLocation = async (req, res) => {
  try {
    const { location } = req.query;
    if (!location) {
      return res.status(400).json({ error: "Location is required" });
    }

    let formattedStocks = [];
    let locations = {};

    if (location === "OVERALL") {
      const stocks = await LeatherStock.findAll({
        include: [
          {
            model: LeatherProduct,
            as: "product",
            attributes: ["id", "leather_code", "color"],
          },
        ],
        attributes: ["id", "product_id", "location", "total_qty", "available_qty", "reserved_qty"],
        raw: false,
      });

      const grouped = {};
      stocks.forEach((stock) => {
        const item = stock.toJSON();
        const productId = item.product_id;
        if (!grouped[productId]) {
          grouped[productId] = {
            id: productId,
            product: item.product,
            total_qty: 0,
            available_qty: 0,
            reserved_qty: 0,
            locations: {},
          };
        }

        grouped[productId].total_qty += item.total_qty || 0;
        grouped[productId].available_qty += item.available_qty || 0;
        grouped[productId].reserved_qty += item.reserved_qty || 0;
        grouped[productId].locations[item.location] = {
          total_qty: item.total_qty || 0,
          available_qty: item.available_qty || 0,
          reserved_qty: item.reserved_qty || 0,
        };
      });

      formattedStocks = Object.values(grouped);
    } else {
      const stocks = await LeatherStock.findAll({
        where: { location },
        include: [
          {
            model: LeatherProduct,
            as: "product",
            attributes: ["id", "leather_code", "color"],
          },
        ],
        attributes: ["id", "product_id", "location", "total_qty", "available_qty", "reserved_qty"],
        raw: false,
      });

      formattedStocks = stocks.map((stock) => stock.toJSON());
    }

    res.json({ stocks: formattedStocks, locations });
  } catch (error) {
    console.error("Get stocks by location error:", error);
    res.status(500).json({ error: "Failed to fetch stocks by location" });
  }
};

exports.updateEstimatedDeliveryDate = async (req, res) => {
  try {
    const { stockId } = req.params;
    const { estimated_delivery_date } = req.body;

    if (!stockId) {
      return res.status(400).json({ error: "Stock ID is required" });
    }

    const stock = await LeatherStock.findByPk(stockId);
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    // Update estimated delivery date
    await stock.update({
      estimated_delivery_date: estimated_delivery_date || null,
    });

    res.json({
      message: "Estimated delivery date updated successfully",
      stock: stock.toJSON(),
    });
  } catch (error) {
    console.error("Update estimated delivery date error:", error);
    res.status(500).json({ error: "Failed to update estimated delivery date" });
  }
};

/**
 * Get stock movement analysis with categorization
 * Query params: startDate, endDate, location (optional)
 */
exports.getStockMovementAnalysis = async (req, res) => {
  try {
    const { startDate, endDate, location } = req.query;

    const analysis = await stockAnalysisService.getStockMovementAnalysis(
      startDate,
      endDate,
      location
    );

    return res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error("Stock movement analysis error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch stock movement analysis",
    });
  }
};

/**
 * Get top moving products
 * Query params: limit, startDate, endDate, category (fast-moving|medium-moving|slow-moving|non-moving)
 */
exports.getTopMovingProducts = async (req, res) => {
  try {
    const { limit = 10, startDate, endDate, category } = req.query;

    const products = await stockAnalysisService.getTopMovingProducts(
      parseInt(limit),
      startDate,
      endDate,
      category
    );

    return res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Top moving products error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch top moving products",
    });
  }
};

/**
 * Get stock movement trend over time
 * Query params: startDate, endDate, groupBy (day|week|month)
 */
exports.getStockMovementTrend = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = "day" } = req.query;

    const trends = await stockAnalysisService.getStockMovementTrend(
      startDate,
      endDate,
      groupBy
    );

    return res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    console.error("Stock movement trend error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch stock movement trend",
    });
  }
};



