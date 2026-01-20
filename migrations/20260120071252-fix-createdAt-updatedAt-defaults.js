"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("leather_products", "createdAt", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    });

    await queryInterface.changeColumn("leather_products", "updatedAt", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("leather_products", "createdAt", {
      type: Sequelize.DATE,
      allowNull: false,
    });

    await queryInterface.changeColumn("leather_products", "updatedAt", {
      type: Sequelize.DATE,
      allowNull: false,
    });
  },
};
