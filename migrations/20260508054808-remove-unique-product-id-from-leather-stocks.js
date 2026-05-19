'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Remove the unique constraints on product_id
    await queryInterface.removeConstraint('leather_stocks', 'product_id');
    await queryInterface.removeConstraint('leather_stocks', 'unique_leather_stock_per_product');
    
    // Add unique constraint on (product_id, location)
    await queryInterface.addConstraint('leather_stocks', {
      fields: ['product_id', 'location'],
      type: 'unique',
      name: 'unique_product_location'
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove the composite unique constraint
    await queryInterface.removeConstraint('leather_stocks', 'unique_product_location');
    
    // Add back the unique constraints on product_id
    await queryInterface.addConstraint('leather_stocks', {
      fields: ['product_id'],
      type: 'unique',
      name: 'product_id'
    });
    await queryInterface.addConstraint('leather_stocks', {
      fields: ['product_id'],
      type: 'unique',
      name: 'unique_leather_stock_per_product'
    });
  }
};
