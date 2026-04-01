'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.addColumn('leather_stocks', 'estimated_delivery_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Estimated delivery date for low stock items',
    });
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('leather_stocks', 'estimated_delivery_date');
  },
};
