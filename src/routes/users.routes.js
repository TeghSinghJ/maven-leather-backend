const router = require("express").Router();
const {
  createExecutive,
  updateExecutive,
  deleteExecutive,
  listExecutives,
} = require("../controllers/user.controller");

const {
  requireAuth,
  requireAdmin,
} = require("../middlewares/auth");

router.use(requireAuth, requireAdmin);

router.post("/", createExecutive);
router.get("/", listExecutives);
router.put("/:id", updateExecutive);
router.delete("/:id", deleteExecutive);

module.exports = router;
