const {
  CollectionPrice,
  CollectionSeries,
  SubCollection,
  MainCollection,
} = require("../../models");

exports.create = async (req, res) => {
  try {
    const { collection_series_id, price_type, price } = req.body;

    if (!collection_series_id || !price_type || price == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const priceEntry = await CollectionPrice.create({
      collection_series_id,
      price_type,
      price,
    });

    res.status(201).json(priceEntry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create price" });
  }
};

exports.list = async (req, res) => {
  const prices = await CollectionPrice.findAll({
    include: [
      {
        model: CollectionSeries,
        as: "series",
        include: [
          {
            model: SubCollection,
            as: "subCollection",
            include: [
              {
                model: MainCollection,
                as: "mainCollection",
              },
            ],
          },
        ],
      },
    ],
    order: [["id", "DESC"]],
  });

  res.json(prices);
};

exports.getOne = async (req, res) => {
  const item = await CollectionPrice.findByPk(req.params.id, {
    include: [
      {
        model: CollectionSeries,
        as: "series",
        include: [
          {
            model: SubCollection,
            as: "subCollection",
            include: [
              {
                model: MainCollection,
                as: "mainCollection",
              },
            ],
          },
        ],
      },
    ],
  });

  res.json(item);
};

exports.getById = async (req, res) => {
  try {
    const price = await CollectionPrice.findByPk(req.params.id, {
      include: ["series"],
    });

    if (!price) {
      return res.status(404).json({ message: "Price not found" });
    }

    res.json(price);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch price" });
  }
};

exports.update = async (req, res) => {
  try {
    const price = await CollectionPrice.findByPk(req.params.id);

    if (!price) {
      return res.status(404).json({ message: "Price not found" });
    }

    await price.update({
      price,
      price_type,
      collection_series_id,
      is_active,
    });

    res.json(price);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update price" });
  }
};

exports.remove = async (req, res) => {
  try {
    const price = await CollectionPrice.findByPk(req.params.id);

    if (!price) {
      return res.status(404).json({ message: "Price not found" });
    }

    await price.destroy();
    res.json({ message: "Price deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete price" });
  }
};
