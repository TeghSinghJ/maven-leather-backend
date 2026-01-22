"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await Promise.all([
      queryInterface.addColumn("proforma_invoices", "transport_name", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.addColumn("proforma_invoices", "receiver_courier_name", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.addColumn("proforma_invoices", "delivery_address", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.addColumn("proforma_invoices", "bus_company_details", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await Promise.all([
      queryInterface.removeColumn("proforma_invoices", "transport_name"),
      queryInterface.removeColumn("proforma_invoices", "receiver_courier_name"),
      queryInterface.removeColumn("proforma_invoices", "delivery_address"),
      queryInterface.removeColumn("proforma_invoices", "bus_company_details"),
    ]);
  },
};
