'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop the old product_id unique constraint that prevents multiple locations per product
    await queryInterface.removeIndex('leather_stocks', 'unique_leather_stock_per_product');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addConstraint('leather_stocks', {
      fields: ['product_id'],
      type: 'unique',
      name: 'unique_leather_stock_per_product',
    });
  },
};
