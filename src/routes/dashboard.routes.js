const express = require("express");
const router = express.Router();
const { getDashboardCounts } = require("../controllers/dashboard.controller");

router.get("/counts", getDashboardCounts);

module.exports = router;
