const express = require("express");
const router = express.Router();
const controller = require("../controllers/pi.controller");

router.post("/", controller.createPI);
router.get("/", controller.getPIs);
router.post("/:id/cancel", controller.cancelPI);
router.get("/:id/download", controller.downloadPI);

module.exports = router;
