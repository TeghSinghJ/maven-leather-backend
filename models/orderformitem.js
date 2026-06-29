'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OrderFormItem extends Model {
    static associate(models) {
      OrderFormItem.belongsTo(models.OrderForm, {
        foreignKey: 'order_form_id',
        as: 'orderForm',
      });

      OrderFormItem.belongsTo(models.LeatherProduct, {
        foreignKey: 'product_id',
        as: 'product',
      });
    }
  }

  OrderFormItem.init(
    {
      order_form_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      qty: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      rate: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      batch_info: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      suggested_batches: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'OrderFormItem',
      tableName: 'order_form_items',
    },
  );

  return OrderFormItem;
};
