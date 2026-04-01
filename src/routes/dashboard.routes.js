const express = require("express");
const router = express.Router();
const { getDashboardCounts, getAllStocks, getStocksByLocation, updateEstimatedDeliveryDate } = require("../controllers/dashboard.controller");
const { requireAuth, requireAdmin } = require("../middlewares/auth");

router.get("/counts", getDashboardCounts);
router.get("/all", requireAuth, requireAdmin, getAllStocks);
router.get("/stocks-by-location", requireAuth, getStocksByLocation);
router.put("/:stockId/delivery-date", requireAuth, requireAdmin, updateEstimatedDeliveryDate);

module.exports = router;
