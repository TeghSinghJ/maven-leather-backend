"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn(
      "collection_prices",
      "article_name"
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "collection_prices",
      "article_name",
      {
        type: Sequelize.STRING,
        allowNull: true,
      }
    );
  },
};
