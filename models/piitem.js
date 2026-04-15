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
      rate: DataTypes.FLOAT,
      batch_info: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      surcharge: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
        comment: 'Additional amount to add on top of (qty * rate). Use for manual adjustments/discounts',
      },
    },
    {
      sequelize,
      modelName: "PIItem",
      tableName: "pi_items",
    },
  );

  return PIItem;
};
