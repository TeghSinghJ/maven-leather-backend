const router = require("express").Router();
const controller = require("../controllers/subCollection.controller");

router.post("/", controller.create);
router.get("/", controller.findAll);
router.get("/:id", controller.findOne);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);
router.get("/get/:mainId", controller.getSubCollectionsByMain);

module.exports = router;
