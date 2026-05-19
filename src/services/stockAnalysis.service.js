const { sequelize } = require("../../models");
const {
  LeatherProduct,
  LeatherStock,
  ProformaInvoice,
  PIItem,
  CollectionSeries,
} = require("../../models");
const { Op } = require("sequelize");

/**
 * Calculate stock movement analysis
 * Returns data categorized by fast/medium/slow/non-moving stocks
 */
exports.getStockMovementAnalysis = async (startDate, endDate, location = null) => {
  try {
    // Get all products with their stock and PI data
    const products = await LeatherProduct.findAll({
      include: [
        {
          model: LeatherStock,
          as: "stock",
          where: location ? { location } : {},
          required: false,
        },
        {
          model: CollectionSeries,
          as: "series",
          attributes: ["id", "name"],
        },
      ],
      attributes: ["id", "leather_code", "color", "status"],
    });

    const dateFilter = {};
    if (startDate) dateFilter.dispatched_at = { [Op.gte]: new Date(startDate) };
    if (endDate) {
      if (!dateFilter.dispatched_at) dateFilter.dispatched_at = {};
      dateFilter.dispatched_at[Op.lte] = new Date(endDate);
    }

    // Get all dispatched PIs within date range
    const dispatchedPIs = await ProformaInvoice.findAll({
      where: {
        status: "DISPATCHED",
        ...dateFilter,
      },
      include: [
        {
          model: PIItem,
          as: "items",
          attributes: ["product_id", "qty"],
        },
      ],
      attributes: ["id", "dispatched_at"],
    });

    // Calculate metrics per product
    const productMetrics = {};

    products.forEach((product) => {
      productMetrics[product.id] = {
        id: product.id,
        leather_code: product.leather_code,
        color: product.color,
        status: product.status,
        article: product.series?.name || "Unknown",
        stock_quantity: product.stock?.available_qty || 0,
        total_stock: product.stock?.total_qty || 0,
        dispatched_qty: 0,
        pi_count: 0,
        movement_category: "non-moving",
      };
    });

    // Aggregate dispatch data
    dispatchedPIs.forEach((pi) => {
      const piItems = pi.items || [];
      piItems.forEach((item) => {
        if (productMetrics[item.product_id]) {
          productMetrics[item.product_id].dispatched_qty += item.qty;
          productMetrics[item.product_id].pi_count += 1;
        }
      });
    });

    // Categorize products based on dispatch metrics
    const movementData = Object.values(productMetrics).map((metric) => {
      // Determine category based on dispatched quantity
      if (metric.dispatched_qty === 0) {
        metric.movement_category = "non-moving";
      } else if (metric.dispatched_qty > 100) {
        metric.movement_category = "fast-moving";
      } else if (metric.dispatched_qty > 30) {
        metric.movement_category = "medium-moving";
      } else {
        metric.movement_category = "slow-moving";
      }

      return metric;
    });

    return {
      period: { startDate, endDate },
      products: movementData,
      summary: generateSummary(movementData),
      byArticle: groupByArticle(movementData),
      byColor: groupByColor(movementData),
    };
  } catch (error) {
    throw new Error(`Stock movement analysis failed: ${error.message}`);
  }
};

/**
 * Generate summary statistics
 */
function generateSummary(products) {
  const summary = {
    "fast-moving": { count: 0, total_qty: 0, avg_qty: 0 },
    "medium-moving": { count: 0, total_qty: 0, avg_qty: 0 },
    "slow-moving": { count: 0, total_qty: 0, avg_qty: 0 },
    "non-moving": { count: 0, total_qty: 0, avg_qty: 0 },
  };

  products.forEach((product) => {
    const category = product.movement_category;
    summary[category].count += 1;
    summary[category].total_qty += product.dispatched_qty;
  });

  // Calculate averages
  Object.keys(summary).forEach((key) => {
    if (summary[key].count > 0) {
      summary[key].avg_qty = (
        summary[key].total_qty / summary[key].count
      ).toFixed(2);
    }
  });

  return summary;
}

/**
 * Group products by article (collection series)
 */
function groupByArticle(products) {
  const grouped = {};

  products.forEach((product) => {
    const article = product.article;
    if (!grouped[article]) {
      grouped[article] = {
        name: article,
        "fast-moving": 0,
        "medium-moving": 0,
        "slow-moving": 0,
        "non-moving": 0,
        total_qty: 0,
      };
    }
    grouped[article][product.movement_category] += 1;
    grouped[article].total_qty += product.dispatched_qty;
  });

  return Object.values(grouped);
}

/**
 * Group products by color
 */
function groupByColor(products) {
  const grouped = {};

  products.forEach((product) => {
    const color = product.color || "Unknown";
    if (!grouped[color]) {
      grouped[color] = {
        name: color,
        "fast-moving": 0,
        "medium-moving": 0,
        "slow-moving": 0,
        "non-moving": 0,
        total_qty: 0,
      };
    }
    grouped[color][product.movement_category] += 1;
    grouped[color].total_qty += product.dispatched_qty;
  });

  return Object.values(grouped);
}

/**
 * Get top moving products
 */
exports.getTopMovingProducts = async (
  limit = 10,
  startDate,
  endDate,
  category = null
) => {
  try {
    const analysis = await this.getStockMovementAnalysis(startDate, endDate);

    let products = analysis.products;

    // Filter by category if specified
    if (category) {
      products = products.filter((p) => p.movement_category === category);
    }

    // Sort by dispatched quantity descending
    return products.sort((a, b) => b.dispatched_qty - a.dispatched_qty).slice(0, limit);
  } catch (error) {
    throw new Error(`Failed to get top moving products: ${error.message}`);
  }
};

/**
 * Get stock movement trend (daily/weekly aggregation)
 */
exports.getStockMovementTrend = async (
  startDate,
  endDate,
  groupBy = "day"
) => {
  try {
    const dateFilter = {};
    if (startDate) dateFilter.dispatched_at = { [Op.gte]: new Date(startDate) };
    if (endDate) {
      if (!dateFilter.dispatched_at) dateFilter.dispatched_at = {};
      dateFilter.dispatched_at[Op.lte] = new Date(endDate);
    }

    let dateFormat = "%Y-%m-%d"; // day
    if (groupBy === "week") dateFormat = "%Y-%W";
    if (groupBy === "month") dateFormat = "%Y-%m";

    const trends = await sequelize.query(
      `
      SELECT 
        DATE_FORMAT(pi.dispatched_at, '${dateFormat}') as period,
        SUM(pii.qty) as total_qty,
        COUNT(DISTINCT pi.id) as pi_count,
        COUNT(DISTINCT pii.product_id) as unique_products
      FROM proforma_invoices pi
      LEFT JOIN pi_items pii ON pi.id = pii.pi_id
      WHERE pi.status = 'DISPATCHED' AND pi.dispatched_at IS NOT NULL
        ${startDate ? "AND pi.dispatched_at >= :startDate" : ""}
        ${endDate ? "AND pi.dispatched_at <= :endDate" : ""}
      GROUP BY DATE_FORMAT(pi.dispatched_at, '${dateFormat}')
      ORDER BY period ASC
      `,
      {
        replacements: { startDate, endDate },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return trends;
  } catch (error) {
    throw new Error(`Failed to get stock movement trend: ${error.message}`);
  }
};
