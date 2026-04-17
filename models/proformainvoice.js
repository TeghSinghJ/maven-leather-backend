"use strict";
const { Model } = require("sequelize");
const { COMPANY_LIST, COMPANY } = require("../src/constants/company.constants");

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

      // 🔐 RBAC Association: Track PI creator
      ProformaInvoice.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "creator",
      });
    }
  }

  ProformaInvoice.init(
    {
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "User ID who created this PI (Business Executive or Admin)",
      },
      company_name: {
        type: DataTypes.ENUM(...COMPANY_LIST),
        allowNull: false,
        defaultValue: COMPANY.MARVIN,
      },
      status: {
        type: DataTypes.ENUM(
          "ACTIVE",
          "PENDING_APPROVAL",
          "CONFIRMED",
          "DISPATCHED",
          "EXPIRED",
          "CANCELLED",
        ),
        defaultValue: "PENDING_APPROVAL",
      },

      invoice_bill_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      dispatched_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true,
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
      payment_status: {
        type: DataTypes.ENUM("NOT_PAID", "HALF_PAID", "FULL_PAID"),
        defaultValue: "NOT_PAID",
      },
      amount_paid: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      receiver_courier_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      transport_amount: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      billing_address: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Billing address for the customer",
      },
      shipping_address: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Shipping address (can differ from billing address). Admin can manually enter for each PI",
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
