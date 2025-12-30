"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("leather_stocks", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "leather_products",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      total_qty: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      available_qty: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      reserved_qty: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
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

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("leather_stocks");
  },
};
