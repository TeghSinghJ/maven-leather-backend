'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('leather_folds', 'location', {
      type: Sequelize.ENUM('Bangalore', 'Delhi', 'Mumbai'),
      defaultValue: 'Bangalore',
      comment: 'Collection location/branch',
      allowNull: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('leather_folds', 'location');
  },
};