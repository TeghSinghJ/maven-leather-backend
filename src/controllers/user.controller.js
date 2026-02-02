const { User } = require("../../models");
const { hashPassword } = require("../helpers/auth");

exports.createExecutive = async (req, res) => {
  try {
    const data = req.body;
    data.password = await hashPassword(data.password);
    data.role = "BUSINESS_EXECUTIVE";

    const user = await User.create(data);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateExecutive = async (req, res) => {
  try {
    const { id } = req.params;
    await User.update(req.body, { where: { id } });
    res.json({ message: "Updated successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteExecutive = async (req, res) => {
  try {
    const { id } = req.params;
    await User.update({ is_active: false }, { where: { id } });
    res.json({ message: "User deactivated" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.listExecutives = async (req, res) => {
  const users = await User.findAll({
    where: { role: "BUSINESS_EXECUTIVE" },
    attributes: { exclude: ["password"] },
  });
  res.json(users);
};
