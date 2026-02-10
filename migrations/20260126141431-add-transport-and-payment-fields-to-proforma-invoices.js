'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('proforma_invoices');

    if (!table.transport_type_id) {
      await queryInterface.addColumn("proforma_invoices", "transport_type_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "transport_types", // make sure this table exists
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    if (!table.transport_id) {
      await queryInterface.addColumn("proforma_invoices", "transport_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "transports", // lowercase table name to match MySQL
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    if (!table.weight_kg) {
      await queryInterface.addColumn("proforma_invoices", "weight_kg", {
        type: Sequelize.FLOAT,
        allowNull: true,
      });
    }

    if (!table.transport_payment_status) {
      await queryInterface.addColumn(
        "proforma_invoices",
        "transport_payment_status",
        {
          type: Sequelize.ENUM("PAID", "TO_BE_PAID"),
          defaultValue: "TO_BE_PAID",
        }
      );
    }

    if (!table.transport_amount) {
      await queryInterface.addColumn("proforma_invoices", "transport_amount", {
        type: Sequelize.FLOAT,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('proforma_invoices');

    if (table.transport_type_id) await queryInterface.removeColumn("proforma_invoices", "transport_type_id");
    if (table.transport_id) await queryInterface.removeColumn("proforma_invoices", "transport_id");
    if (table.weight_kg) await queryInterface.removeColumn("proforma_invoices", "weight_kg");
    if (table.transport_payment_status) await queryInterface.removeColumn("proforma_invoices", "transport_payment_status");
    if (table.transport_amount) await queryInterface.removeColumn("proforma_invoices", "transport_amount");
  },
};
