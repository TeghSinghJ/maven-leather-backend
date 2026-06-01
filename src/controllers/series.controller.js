const { CollectionSeries } = require("../../models");

exports.create = async (req, res) => {
  try {
    const data = await CollectionSeries.create(req.body);
    res.status(201).json(data);
  } catch (error) {
    console.error("series.create error:", error);
    res.status(400).json({ error: error.message });
  }
};

exports.findAll = async (req, res) => {
  const data = await CollectionSeries.findAll({
    where: req.query.sub_collection_id
      ? { sub_collection_id: req.query.sub_collection_id }
      : undefined,
  });
  res.json(data);
};

exports.findOne = async (req, res) => {
  const data = await CollectionSeries.findByPk(req.params.id);
  if (!data) return res.status(404).json({ message: "Not found" });
  res.json(data);
};

exports.update = async (req, res) => {
  try {
    const [updated] = await CollectionSeries.update(req.body, {
      where: { id: req.params.id },
    });
    res.json({ updated });
  } catch (error) {
    console.error("series.update error:", error);
    res.status(400).json({ error: error.message });
  }
};

exports.remove = async (req, res) => {
  await CollectionSeries.destroy({ where: { id: req.params.id } });
  res.status(204).send();
};
// controllers/collectionSeries.controller.js

exports.getSeriesBySubCollection = async (req, res) => {
  try {
    const where = { sub_collection_id: req.params.subId };
    if (req.query.location) {
      where.location = req.query.location;
    }

    const data = await CollectionSeries.findAll({
      where,
      order: [["name", "ASC"]],
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
