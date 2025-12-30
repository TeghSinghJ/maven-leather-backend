const { SubCollection } = require("../../models");

exports.create = async (req, res) => {
  const data = await SubCollection.create(req.body);
  res.status(201).json(data);
};

exports.findAll = async (req, res) => {
  const data = await SubCollection.findAll({
    where: req.query.main_collection_id
      ? { main_collection_id: req.query.main_collection_id }
      : undefined,
  });
  res.json(data);
};

exports.findOne = async (req, res) => {
  const data = await SubCollection.findByPk(req.params.id);
  if (!data) return res.status(404).json({ message: "Not found" });
  res.json(data);
};

exports.update = async (req, res) => {
  const [updated] = await SubCollection.update(req.body, {
    where: { id: req.params.id },
  });
  res.json({ updated });
};

exports.remove = async (req, res) => {
  await SubCollection.destroy({ where: { id: req.params.id } });
  res.status(204).send();
};
// controllers/subCollection.controller.js

exports.getSubCollectionsByMain = async (req, res) => {
  try {
    console.log("Fetching sub collections for main collection:", req.params.mainId);
    const data = await SubCollection.findAll({
      where: { main_collection_id: req.params.mainId },
      order: [["name", "ASC"]],
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

