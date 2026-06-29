'use strict';
const { Model } = require('sequelize');
const { COMPANY, COMPANY_LIST } = require('../src/constants/company.constants');

module.exports = (sequelize, DataTypes) => {
  class OrderForm extends Model {
    static associate(models) {
      OrderForm.belongsTo(models.Customer, {
        foreignKey: 'customer_id',
        as: 'customer',
      });

      OrderForm.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'creator',
      });

      OrderForm.hasMany(models.OrderFormItem, {
        foreignKey: 'order_form_id',
        as: 'items',
      });
    }
  }

  OrderForm.init(
    {
      order_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      company_name: {
        type: DataTypes.ENUM(...COMPANY_LIST),
        allowNull: false,
        defaultValue: COMPANY.MARVIN,
      },
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      customer_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      gst_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contact_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pin_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      order_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      order_time: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      requested_delivery_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      delivery_time: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('DRAFT', 'CONFIRMED', 'CANCELLED', 'COMPLETED'),
        defaultValue: 'DRAFT',
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'OrderForm',
      tableName: 'order_forms',
    },
  );

  return OrderForm;
};
