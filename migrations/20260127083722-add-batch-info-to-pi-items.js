"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("pi_items", "batch_info", {
      type: Sequelize.TEXT,
      allowNull: true,
      after: "rate", 
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("pi_items", "batch_info");
  },
};
