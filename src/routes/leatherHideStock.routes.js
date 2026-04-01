const express = require("express");
const router = express.Router();
const controller = require("../controllers/leatherHideStock.controller");
const multer = require("multer");

const upload = require("../middlewares/upload.middleware");

router.post("/", controller.createHideStock);
router.get("/product/:productId", controller.listByProduct);
router.patch("/:id/status", controller.updateStatus);
router.put("/:id", controller.updateHide);
router.delete("/:id", controller.deleteHide);
router.post("/bulk", controller.createBulkHideStock);
router.post("/upload-excel", upload.single("file"), controller.bulkUploadHidesExcel);

module.exports = router;
