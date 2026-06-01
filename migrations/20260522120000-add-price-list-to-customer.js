"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("customers", "price_list", {
      type: Sequelize.ENUM("WESTERN", "MARVIN"),
      allowNull: true,
      defaultValue: "WESTERN",
      comment: "Brand-specific price list: WESTERN or MARVIN",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("customers", "price_list");
  },
};
