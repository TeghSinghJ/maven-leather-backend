"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("proforma_invoices", "status", {
      type: Sequelize.ENUM(
        "ACTIVE",
        "EXPIRED",
        "CONFIRMED",
        "CANCELLED"
      ),
      allowNull: false,
      defaultValue: "ACTIVE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("proforma_invoices", "status", {
      type: Sequelize.ENUM(
        "ACTIVE",
        "EXPIRED",
        "CONFIRMED"
      ),
      allowNull: false,
      defaultValue: "ACTIVE",
    });
  },
};
