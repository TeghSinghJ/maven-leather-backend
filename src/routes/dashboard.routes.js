const express = require("express");
const router = express.Router();
const { getDashboardCounts, getAllStocks } = require("../controllers/dashboard.controller");

router.get("/counts", getDashboardCounts);
router.get("/all", getAllStocks);

module.exports = router;
