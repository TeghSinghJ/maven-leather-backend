const router = require("express").Router();
const controller = require("../controllers/collection.controller");

router.post("/", controller.create);
router.get("/get/all", controller.findAll);
router.get("/:id", controller.findOne);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);
router.get("/", controller.getMainCollections);

module.exports = router;
