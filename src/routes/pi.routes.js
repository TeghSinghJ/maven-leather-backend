const express = require("express");
const router = express.Router();
const controller = require("../controllers/pi.controller");
const { requireAuth, requireAdmin } = require("../middlewares/auth");

// Create a new PI - Accessible by Business Executive and Admin
router.post("/", requireAuth, controller.createPI);

// Get all PIs
router.get("/", requireAuth, controller.getPIs);

// Specific routes MUST come before :id routes
router.post("/suggest-batch", requireAuth, controller.suggestBatch);
router.post("/confirmed", requireAuth, controller.createPIConfirmed);
router.get("/pending/approval", requireAuth, requireAdmin, controller.getPendingApprovalPIs);

// ID-based routes
router.post("/:id/cancel", requireAuth, controller.cancelPI);
router.post("/:id/approve", requireAuth, requireAdmin, controller.adminApprovePI);
router.post("/:id/suggest-revisit", requireAuth, controller.suggestRevisit);
router.put("/:id/revisit", requireAuth, controller.revisitPI);
router.get("/:id/download", requireAuth, controller.downloadPI);
router.get("/:id", requireAuth, controller.getPIById);

module.exports = router;
