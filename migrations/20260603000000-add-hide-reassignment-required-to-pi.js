'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('proforma_invoices', 'hide_reassignment_required', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Flag to mark PIs that need hide reassignment after a locked hide was moved to another order',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('proforma_invoices', 'hide_reassignment_required');
  },
};
