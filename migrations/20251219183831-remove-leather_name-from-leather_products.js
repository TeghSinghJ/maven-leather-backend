"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn("leather_products", "leather_name");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("leather_products", "leather_name", {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },
};
