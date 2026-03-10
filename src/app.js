require('dotenv').config(); 
const express = require("express");
const cors = require("cors");
const productRoutes = require("./routes/product.routes");
const piRoutes = require("./routes/pi.routes");
const app = express();

// // Configure CORS based on environment
// const corsOptions = {
//   origin: (origin, callback) => {
//     const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:19006').split(',');
    
//     // Allow requests with no origin (like mobile apps)
//     if (!origin || allowedOrigins.some(allowed => allowed.trim() === origin)) {
//       callback(null, true);
//     } else {
//       console.warn(`CORS blocked request from origin: ${origin}`);
//       callback(new Error('Not allowed by CORS policy'));
//     }
//   },
//   credentials: true,
//   optionsSuccessStatus: 200,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// };

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/products", productRoutes);
app.use("/uploads", express.static("uploads"));
app.use("/api/pi", piRoutes);
app.use("/api/collections", require("./routes/collection.routes"));
app.use("/api/sub-collections", require("./routes/subCollection.routes"));
app.use("/api/series", require("./routes/series.routes"));
app.use("/api/leather-hide-stocks", require("./routes/leatherHideStock.routes"));
app.use("/api/collection-prices", require("./routes/collectionPrice.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/stocks", require("./routes/dashboard.routes"));
app.use("/api/transports", require("./routes/transport.routes"));
app.use("/api/customers", require("./routes/customer.routes"));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/users.routes"));
app.use("/api/batches", require("./routes/batch.routes"));

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

// Auto-cancel PIs after 7 days
const cron = require('node-cron');
const { ProformaInvoice, PIItem, LeatherStock, LeatherHideStock, sequelize } = require('../models');
const { Op } = require('sequelize');

cron.schedule('0 0 * * *', async () => { // Run daily at midnight
  console.log('Running auto-cancel job for old PIs...');
  const t = await sequelize.transaction();
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const oldPIs = await ProformaInvoice.findAll({
      where: {
        status: { [Op.in]: ['ACTIVE', 'PENDING_APPROVAL'] },
        createdAt: { [Op.lt]: sevenDaysAgo }
      },
      include: [{ model: PIItem, as: 'items' }],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    for (const pi of oldPIs) {
      // Restore stock logic (similar to cancelPI)
      const productIds = pi.items.map(i => i.product_id);
      const stocks = await LeatherStock.findAll({ where: { product_id: { [Op.in]: productIds } }, transaction: t, lock: t.LOCK.UPDATE });
      const stockMap = {};
      stocks.forEach(s => (stockMap[s.product_id] = s));
      for (const item of pi.items) {
        const stock = stockMap[item.product_id];
        if (!stock) continue;
        stock.available_qty += item.qty;
        stock.reserved_qty -= item.qty;
        if (stock.reserved_qty < 0) stock.reserved_qty = 0;
        await stock.save({ transaction: t });
      }

      for (const item of pi.items) {
        let batches = [];
        if (Array.isArray(item.batch_info)) batches = item.batch_info;
        else if (typeof item.batch_info === "string") {
          try { batches = JSON.parse(item.batch_info); } catch { batches = []; }
        }

        for (const b of batches) {
          if (!b.hide_id) continue;
          const hideStock = await LeatherHideStock.findOne({ where: { hide_id: b.hide_id }, transaction: t, lock: t.LOCK.UPDATE });
          if (hideStock) {
            hideStock.qty += b.qty;
            hideStock.status = "AVAILABLE";
            await hideStock.save({ transaction: t });
          }
        }
      }

      pi.status = 'CANCELLED';
      pi.cancelled_at = new Date();
      await pi.save({ transaction: t });
    }

    await t.commit();
    console.log(`Auto-cancelled ${oldPIs.length} PIs`);
  } catch (err) {
    await t.rollback();
    console.error('Auto-cancel job failed:', err);
  }
});

module.exports = app;
