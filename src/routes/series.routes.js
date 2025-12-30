const router = require("express").Router();
const controller = require("../controllers/series.controller");

router.post("/", controller.create);
router.get("/", controller.findAll);
router.get("/:id", controller.findOne);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);
router.get("/sub/:subId", controller.getSeriesBySubCollection);

module.exports = router;
