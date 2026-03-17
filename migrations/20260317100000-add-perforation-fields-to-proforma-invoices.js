'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('proforma_invoices', 'perforation_qty', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
    });
    await queryInterface.addColumn('proforma_invoices', 'perforation_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
    });
    await queryInterface.addColumn('proforma_invoices', 'perforation_payment_status', {
      type: Sequelize.ENUM('PENDING', 'PAID'),
      allowNull: true,
      defaultValue: 'PENDING',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('proforma_invoices', 'perforation_qty');
    await queryInterface.removeColumn('proforma_invoices', 'perforation_amount');
    await queryInterface.removeColumn('proforma_invoices', 'perforation_payment_status');
  }
};