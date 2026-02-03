const express = require("express");
const router = express.Router();
const controller = require("../controllers/pi.controller");

// Create a new PI
router.post("/", controller.createPI);

// Get all PIs
router.get("/", controller.getPIs);

// Cancel a PI
router.post("/:id/cancel", controller.cancelPI);

// Revisit/Update a PI
router.put("/:id/revisit", controller.revisitPI);

// Download PI PDF
router.get("/:id/download", controller.downloadPI);

// Suggest batch for requested quantity
router.post("/suggest-batch", controller.suggestBatch);
router.post("/confirmed", controller.createPIConfirmed); 
router.get("/pending/approval", controller.getPendingApprovalPIs);
router.get("/:id", controller.getPIById);
router.post("/:id/approve", controller.adminApprovePI);
module.exports = router;
