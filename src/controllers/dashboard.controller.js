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
