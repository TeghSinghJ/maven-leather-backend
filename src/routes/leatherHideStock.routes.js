const express = require("express");
const router = express.Router();
const controller = require("../controllers/leatherHideStock.controller");

router.post("/", controller.createHideStock);
router.get("/product/:productId", controller.listByProduct);
router.patch("/:id/status", controller.updateStatus);
router.post("/bulk", controller.createBulkHideStock);
router.post("/upload-excel", controller.bulkUploadHidesExcel);

module.exports = router;
