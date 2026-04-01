const {
  MainCollection,
  SubCollection,
  CollectionSeries,
  LeatherProduct,
  LeatherStock,
  ProformaInvoice,
} = require("../../models");

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

    const stocks = await LeatherStock.findAll({
      where: { location },
      include: [
        {
          model: LeatherProduct,
          as: "product",
          attributes: ["id", "leather_code", "color"],
        },
      ],
      attributes: ["id", "available_qty", "location"],
      raw: false,
    });

    const formattedStocks = stocks.map((stock) => stock.toJSON());

    res.json(formattedStocks);
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


