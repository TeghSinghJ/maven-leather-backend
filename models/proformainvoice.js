"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class ProformaInvoice extends Model {
    static associate(models) {
      ProformaInvoice.hasMany(models.PIItem, {
        foreignKey: "pi_id",
        as: "items",
      });
    }
  }

  ProformaInvoice.init(
    {
      customer_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      whatsapp_number: {
        type: DataTypes.STRING,
      },
      address: {
        type: DataTypes.STRING,
      },
      state: {
        type: DataTypes.STRING,
      },
      gst_number: {
        type: DataTypes.STRING,
      },
      contact_number: {
        type: DataTypes.STRING,
      },
      pin_code: {
        type: DataTypes.STRING,
      },
      status: {
        type: DataTypes.ENUM("ACTIVE", "EXPIRED", "CONFIRMED"),
        defaultValue: "ACTIVE",
      },
      expires_at: {
        type: DataTypes.DATE,
      },
      // NEW FIELDS
      transport_name: {
        type: DataTypes.STRING,
      },
      receiver_courier_name: {
        type: DataTypes.STRING,
      },
      delivery_address: {
        type: DataTypes.STRING,
      },
      bus_company_details: {
        type: DataTypes.STRING,
      },
    },
    {
      sequelize,
      modelName: "ProformaInvoice",
      tableName: "proforma_invoices",
    }
  );

  return ProformaInvoice;
};
