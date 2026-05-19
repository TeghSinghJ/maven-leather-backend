'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if column already exists
    const table = await queryInterface.describeTable('proforma_invoices');
    
    if (!table.performation_amount) {
      await queryInterface.addColumn('proforma_invoices', 'performation_amount', {
        type: Sequelize.FLOAT,
        defaultValue: 0,
        allowNull: true,
        comment: 'Optional performation charge for the invoice'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('proforma_invoices', 'performation_amount');
  }
};
