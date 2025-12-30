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
      customer_name: DataTypes.STRING,
      whatsapp_number: DataTypes.STRING,
      address: DataTypes.STRING,
      state: DataTypes.STRING,
      gst_number: DataTypes.STRING,
      contact_number: DataTypes.STRING,
      pin_code: DataTypes.STRING,
      status: DataTypes.ENUM("ACTIVE", "EXPIRED", "CONFIRMED"),
      expires_at: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "ProformaInvoice",
      tableName: "proforma_invoices",
    }
  );

  return ProformaInvoice;
};
