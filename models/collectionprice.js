"use strict";
module.exports = (sequelize, DataTypes) => {
  const CollectionPrice = sequelize.define(
    "CollectionPrice",
    {
      price_type: {
        type: DataTypes.ENUM("DP", "RRP", "ARCH"),
        allowNull: false,
      },

      price: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },

      collection_series_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "collection_prices",
    },
  );

  CollectionPrice.associate = (models) => {
    CollectionPrice.belongsTo(models.CollectionSeries, {
      foreignKey: "collection_series_id",
      as: "series",
    });
  };

  return CollectionPrice;
};
