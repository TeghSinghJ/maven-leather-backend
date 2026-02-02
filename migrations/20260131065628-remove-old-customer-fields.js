'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn('proforma_invoices', 'customer_name');
    await queryInterface.removeColumn('proforma_invoices', 'address');
    await queryInterface.removeColumn('proforma_invoices', 'state');
    await queryInterface.removeColumn('proforma_invoices', 'gst_number');
    await queryInterface.removeColumn('proforma_invoices', 'pin_code');
    await queryInterface.removeColumn('proforma_invoices', 'contact_number');
    await queryInterface.removeColumn('proforma_invoices', 'whatsapp_number');
  },

  async down(queryInterface, Sequelize) {
    // Optional: Add the columns back in case of rollback
    await queryInterface.addColumn('proforma_invoices', 'customer_name', { type: Sequelize.STRING, allowNull: false });
    await queryInterface.addColumn('proforma_invoices', 'address', { type: Sequelize.STRING });
    await queryInterface.addColumn('proforma_invoices', 'state', { type: Sequelize.STRING });
    await queryInterface.addColumn('proforma_invoices', 'gst_number', { type: Sequelize.STRING });
    await queryInterface.addColumn('proforma_invoices', 'pin_code', { type: Sequelize.STRING });
    await queryInterface.addColumn('proforma_invoices', 'contact_number', { type: Sequelize.STRING });
    await queryInterface.addColumn('proforma_invoices', 'whatsapp_number', { type: Sequelize.STRING });
  },
};
