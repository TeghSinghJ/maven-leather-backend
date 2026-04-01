'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('proforma_invoices', 'billing_address', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Billing address for the customer'
    });
    
    await queryInterface.addColumn('proforma_invoices', 'shipping_address', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Shipping address (can differ from billing address). Admin can manually enter for each PI'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('proforma_invoices', 'billing_address');
    await queryInterface.removeColumn('proforma_invoices', 'shipping_address');
  }
};
