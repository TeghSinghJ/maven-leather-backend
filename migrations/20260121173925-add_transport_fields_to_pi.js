"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable("proforma_invoices");

    if (!tableDesc.transport_name) {
      await queryInterface.addColumn("proforma_invoices", "transport_name", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableDesc.receiver_courier_name) {
      await queryInterface.addColumn("proforma_invoices", "receiver_courier_name", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableDesc.delivery_address) {
      await queryInterface.addColumn("proforma_invoices", "delivery_address", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableDesc.bus_company_details) {
      await queryInterface.addColumn("proforma_invoices", "bus_company_details", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("proforma_invoices", "transport_name");
    await queryInterface.removeColumn("proforma_invoices", "receiver_courier_name");
    await queryInterface.removeColumn("proforma_invoices", "delivery_address");
    await queryInterface.removeColumn("proforma_invoices", "bus_company_details");
  },
};
