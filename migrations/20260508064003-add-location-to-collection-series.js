'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('collection_series', 'location', {
      type: Sequelize.ENUM('Bangalore', 'Delhi', 'Mumbai', 'Western Colours', 'Italy'),
      defaultValue: 'Bangalore',
      comment: 'Location/branch for this collection series (Bangalore, Delhi, Mumbai, Western Colours, Italy)',
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('collection_series', 'location');
  }
};
