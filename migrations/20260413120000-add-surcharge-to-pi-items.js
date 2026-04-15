'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('pi_items', 'surcharge', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 0,
      after: 'batch_info',
      comment: 'Flat surcharge amount added to line total (qty * rate + surcharge)',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('pi_items', 'surcharge');
  },
};
