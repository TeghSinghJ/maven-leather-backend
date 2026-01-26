"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("proforma_invoices", "transport_type_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "transport_types",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addColumn("proforma_invoices", "transport_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Transports",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addColumn("proforma_invoices", "weight_kg", {
      type: Sequelize.FLOAT,
      allowNull: true,
    });

    await queryInterface.addColumn(
      "proforma_invoices",
      "transport_payment_status",
      {
        type: Sequelize.ENUM("PAID", "TO_BE_PAID"),
        defaultValue: "TO_BE_PAID",
      }
    );

    await queryInterface.addColumn("proforma_invoices", "transport_amount", {
      type: Sequelize.FLOAT,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("proforma_invoices", "transport_type_id");
    await queryInterface.removeColumn("proforma_invoices", "transport_id");
    await queryInterface.removeColumn("proforma_invoices", "weight_kg");
    await queryInterface.removeColumn(
      "proforma_invoices",
      "transport_payment_status"
    );
    await queryInterface.removeColumn(
      "proforma_invoices",
      "transport_amount"
    );
  },
};
