'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      'UPDATE collection_prices SET price_list = "MARVIN" WHERE price_list = "WESTERN"'
    );

    await queryInterface.changeColumn('collection_prices', 'price_list', {
      type: Sequelize.ENUM('WESTERN', 'MARVIN'),
      allowNull: true,
      defaultValue: 'MARVIN',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('collection_prices', 'price_list', {
      type: Sequelize.ENUM('WESTERN', 'MARVIN'),
      allowNull: true,
      defaultValue: 'WESTERN',
    });

    await queryInterface.sequelize.query(
      'UPDATE collection_prices SET price_list = "WESTERN" WHERE price_list = "MARVIN"'
    );
  },
};
