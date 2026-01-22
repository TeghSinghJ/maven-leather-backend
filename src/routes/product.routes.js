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

module.exports = router;
