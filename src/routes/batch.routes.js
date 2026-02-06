const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const controller = require("../controllers/batch.controller");
const { requireAuth, requireAdmin } = require("../middlewares/auth");

// Configure multer for file uploads
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
        "text/csv",
        "text/plain",
        "application/octet-stream",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV and Excel files are allowed"));
    }
  },
});

// Batch CRUD routes
router.post("/", requireAuth, requireAdmin, controller.createBatch);
router.get("/", requireAuth, controller.getBatches);
router.get("/:id", requireAuth, controller.getBatchById);
router.put("/:id", requireAuth, requireAdmin, controller.updateBatch);
router.delete("/:id", requireAuth, requireAdmin, controller.deleteBatch);

// Hide management routes
router.post("/:batch_id/hides", requireAuth, requireAdmin, controller.addHide);
router.put("/hides/:hide_id", requireAuth, requireAdmin, controller.updateHide);
router.delete("/hides/:hide_id", requireAuth, requireAdmin, controller.deleteHide);

// Bulk upload route
router.post(
  "/:batch_id/upload",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  controller.bulkUploadHides
);

// Get batch statistics
router.get("/:batch_id/stats", requireAuth, controller.getBatchStats);

module.exports = router;
