"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("leather_hide_stocks", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      hide_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      batch_no: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      qty: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("AVAILABLE", "RESERVED", "BLOCKED"),
        defaultValue: "AVAILABLE",
      },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("leather_hide_stocks");
  },
};
