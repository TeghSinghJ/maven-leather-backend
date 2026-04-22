'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add return_reason field
    await queryInterface.addColumn('proforma_invoices', 'return_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Reason for returning the PI/stock'
    });

    // Add returned_at field
    await queryInterface.addColumn('proforma_invoices', 'returned_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Timestamp when the stock was marked as returned'
    });

    // Add RETURNED status to the existing enum
    await queryInterface.sequelize.query(`
      ALTER TABLE proforma_invoices 
      MODIFY COLUMN status ENUM('ACTIVE', 'PENDING_APPROVAL', 'CONFIRMED', 'DISPATCHED', 'EXPIRED', 'CANCELLED', 'RETURNED')
      DEFAULT 'PENDING_APPROVAL'
    `);
  },

  async down (queryInterface, Sequelize) {
    // Modify enum to remove RETURNED
    await queryInterface.sequelize.query(`
      ALTER TABLE proforma_invoices 
      MODIFY COLUMN status ENUM('ACTIVE', 'PENDING_APPROVAL', 'CONFIRMED', 'DISPATCHED', 'EXPIRED', 'CANCELLED')
      DEFAULT 'PENDING_APPROVAL'
    `);

    await queryInterface.removeColumn('proforma_invoices', 'return_reason');
    await queryInterface.removeColumn('proforma_invoices', 'returned_at');
  }
};
