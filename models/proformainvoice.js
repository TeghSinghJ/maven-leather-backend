"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class ProformaInvoice extends Model {
    static associate(models) {
      ProformaInvoice.hasMany(models.PIItem, {
        foreignKey: "pi_id",
        as: "items",
      });

      ProformaInvoice.belongsTo(models.TransportType, {
        foreignKey: "transport_type_id",
        as: "transportType",
      });
      ProformaInvoice.belongsTo(models.Customer, {
        foreignKey: "customer_id",
        as: "customer",
      });

      ProformaInvoice.belongsTo(models.Transport, {
        foreignKey: "transport_id",
        as: "transport",
      });
    }
  }

  ProformaInvoice.init(
    {
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      status: {
        type: DataTypes.ENUM(
          "ACTIVE",
          "PENDING_APPROVAL",
          "CONFIRMED",
          "EXPIRED",
          "CANCELLED",
        ),
        defaultValue: "PENDING_APPROVAL",
      },

      expires_at: DataTypes.DATE,

      transport_type_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      transport_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      delivery_address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      weight_kg: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      transport_payment_status: {
        type: DataTypes.ENUM("PAID", "TO_BE_PAID"),
        defaultValue: "TO_BE_PAID",
      },
      receiver_courier_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      transport_amount: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: "ProformaInvoice",
      tableName: "proforma_invoices",
    },
  );

  return ProformaInvoice;
};
