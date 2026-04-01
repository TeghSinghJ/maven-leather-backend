const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload.middleware");
const controller = require("../controllers/product.controller");
const bulkUploadController = require("../controllers/bulkUpload.controller");

router.post("/", upload.single("image"), controller.createProduct);
router.patch("/:id/stock", controller.addStock);
router.post(
  "/bulk-upload",
    upload.single("file"),   
  bulkUploadController.bulkUpload
);
router.get("/", controller.getProducts);
router.get("/available", controller.getAvailableProducts);

// 🎯 NEW: Get collection details with colors and hide-wise data
router.get("/collection/:collection_id/details", controller.getCollectionDetails);

// 🎯 Edit and Delete endpoints (place AFTER collection details to avoid route conflicts)
router.put("/:id", upload.none(), controller.updateProduct);
router.delete("/:id", controller.deleteProduct);
router.get("/:id", controller.getProductById);

module.exports = router;
