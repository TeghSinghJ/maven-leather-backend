"use strict";

const { COMPANY_LIST, COMPANY } = require("../src/constants/company.constants");


module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("proforma_invoices", "company_name", {
      type: Sequelize.ENUM(...COMPANY_LIST),
      allowNull: false,
      defaultValue: COMPANY.MARVIN,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("proforma_invoices", "company_name");

  },
};