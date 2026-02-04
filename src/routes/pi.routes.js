const express = require("express");
const router = express.Router();
const controller = require("../controllers/pi.controller");

// Create a new PI
router.post("/", controller.createPI);

// Get all PIs
router.get("/", controller.getPIs);

// Specific routes MUST come before :id routes
router.post("/suggest-batch", controller.suggestBatch);
router.post("/confirmed", controller.createPIConfirmed);
router.get("/pending/approval", controller.getPendingApprovalPIs);

// ID-based routes
router.post("/:id/cancel", controller.cancelPI);
router.post("/:id/approve", controller.adminApprovePI);
router.put("/:id/revisit", controller.revisitPI);
router.get("/:id/download", controller.downloadPI);
router.get("/:id", controller.getPIById);

module.exports = router;
