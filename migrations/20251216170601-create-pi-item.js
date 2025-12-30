"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("pi_items", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      pi_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "proforma_invoices",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "leather_products",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      qty: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("pi_items");
  },
};
