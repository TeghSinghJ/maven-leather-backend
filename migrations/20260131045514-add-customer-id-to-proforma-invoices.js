"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("proforma_invoices", "customer_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: "customers",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("proforma_invoices", "customer_id");
  },
};
