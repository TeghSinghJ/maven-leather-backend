"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class PIItem extends Model {
    static associate(models) {
      PIItem.belongsTo(models.ProformaInvoice, {
        foreignKey: "pi_id",
        as: "pi",
      });
      PIItem.belongsTo(models.LeatherProduct, {
        foreignKey: "product_id",
        as: "product",
      });
    }
  }

  PIItem.init(
    {
      pi_id: DataTypes.INTEGER,
      product_id: DataTypes.INTEGER,
      qty: DataTypes.FLOAT,
    },
    {
      sequelize,
      modelName: "PIItem",
      tableName: "pi_items",
    }
  );

  return PIItem;
};
