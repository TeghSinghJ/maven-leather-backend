'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leather_stocks', 'location', {
      type: Sequelize.ENUM('Bangalore', 'Delhi', 'Mumbai'),
      defaultValue: 'Bangalore',
      allowNull: false,
      comment: 'Stock location/branch (Bangalore, Delhi, Mumbai)',
    });

    // Add index for faster queries
    await queryInterface.addIndex('leather_stocks', ['location']);
    await queryInterface.addIndex('leather_stocks', ['product_id', 'location']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('leather_stocks', ['product_id', 'location']);
    await queryInterface.removeIndex('leather_stocks', ['location']);
    await queryInterface.removeColumn('leather_stocks', 'location');
  },
};
