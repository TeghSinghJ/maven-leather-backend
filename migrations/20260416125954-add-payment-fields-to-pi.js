'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('proforma_invoices', 'payment_status', {
      type: Sequelize.ENUM('NOT_PAID', 'HALF_PAID', 'FULL_PAID'),
      defaultValue: 'NOT_PAID',
      allowNull: false,
    });
    await queryInterface.addColumn('proforma_invoices', 'amount_paid', {
      type: Sequelize.FLOAT,
      defaultValue: 0,
      allowNull: false,
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('proforma_invoices', 'payment_status');
    await queryInterface.removeColumn('proforma_invoices', 'amount_paid');
  }
};
