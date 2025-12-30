const { MainCollection } = require("../../models");

exports.create = async (req, res) => {
  const data = await MainCollection.create(req.body);
  res.status(201).json(data);
};

exports.findAll = async (req, res) => {
  const data = await MainCollection.findAll();
  res.json(data);
};

exports.findOne = async (req, res) => {
  const data = await MainCollection.findByPk(req.params.id);
  if (!data) return res.status(404).json({ message: "Not found" });
  res.json(data);
};

exports.update = async (req, res) => {
  const [updated] = await MainCollection.update(req.body, {
    where: { id: req.params.id },
  });
  res.json({ updated });
};

exports.remove = async (req, res) => {
  await MainCollection.destroy({ where: { id: req.params.id } });
  res.status(204).send();
};
// controllers/mainCollection.controller.js

exports.getMainCollections = async (req, res) => {
  console.log("Fetching main collections");
  try {
    const data = await MainCollection.findAll({
      where: { status: "ACTIVE" },
      order: [["name", "ASC"]],
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
