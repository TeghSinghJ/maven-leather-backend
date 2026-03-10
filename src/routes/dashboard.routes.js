const express = require("express");
const router = express.Router();
const { getDashboardCounts, getAllStocks } = require("../controllers/dashboard.controller");
const { requireAuth, requireAdmin } = require("../middlewares/auth");

router.get("/counts", getDashboardCounts);
router.get("/all", requireAuth, requireAdmin, getAllStocks);

module.exports = router;
