'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leather_products', 'hsn_code', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: '4107',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('leather_products', 'hsn_code');
  }
};
