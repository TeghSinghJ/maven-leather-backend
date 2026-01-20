"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("leather_stocks", "total_qty", {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.changeColumn("leather_stocks", "available_qty", {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.changeColumn("leather_stocks", "reserved_qty", {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addConstraint("leather_stocks", {
      fields: ["product_id"],
      type: "unique",
      name: "unique_leather_stock_per_product",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "leather_stocks",
      "unique_leather_stock_per_product"
    );
  },
};
